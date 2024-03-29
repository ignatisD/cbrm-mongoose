import * as mongoose from "mongoose";
import { cloneDeep } from "lodash";
import {
    generate,
    IMappingResponse,
    IPaginatedResults,
    IPopulate,
    IQuery,
    IRepositoryBase,
    Query, ReadPreference,
    Repository
} from "@ignatisd/cbrm";
import { IPaginatable } from "./Paginatable";
import { IDeletable } from "./Deletable";

export abstract class MongooseRepositoryBase<T extends mongoose.Document<mongoose.Types.ObjectId> = any> extends Repository<IPaginatable<T>&IDeletable<T>> implements IRepositoryBase<T> {

    protected autopopulate: IPopulate[] = [];
    protected _session: mongoose.ClientSession;
    public get session() {
        return this._session;
    }
    public get sessionId() {
        return this._session ? this._session.id : null;
    }

    public textFields: string[] = [];

    protected constructor(model: IPaginatable<T>&IDeletable<T>) {
        super(model);
    }

    /**
     * Manually update the Model indexes (background)
     */
    async ensureMapping() {
        return await this._model.createIndexes();
    }

    /**
     * Caution! Does not trigger save middleware
     * Transaction Ready
     * @param items
     * @param options
     */
    async insertMany(items: Partial<T>[], options?: { ordered?: boolean; rawResult?: boolean } & mongoose.InsertManyOptions): Promise<T[]> {
        if (this._session) {
            options = options || {};
            options.session = this._session;
        }
        return await this._model.insertMany(items, options);
    }

    /**
     * Transaction Ready of a single document
     * @param item
     */
    async create(item: Partial<T>|any): Promise<T> {
        if (this._session) {
            return await new this._model(item).save({session: this._session});
        }
        return await new this._model(item).save();
    }

    /**
     * Transaction Ready create of many documents
     * @param items
     */
    async createMany(items: (Partial<T>|any)[]): Promise<T[]> {
        if (this._session) {
            return await this._model.create(items, {session: this._session});
        }
        return await this._model.create<T>(items);
    }

    async search(searchTerms: IQuery): Promise<IPaginatedResults<T>> {
        return await this.retrieve(searchTerms);
    }

    async * scrollSearch(st: IQuery): AsyncGenerator<T, void> {
        const searchTerms = Query.clone(st);
        if (searchTerms.options.autopopulate && (searchTerms.options.populate && !searchTerms.options.populate.length) && this.autopopulate.length) {
            searchTerms.options.populate = this.autopopulate;
        }
        delete searchTerms.options.page;
        delete searchTerms.options.offset;
        delete searchTerms.options.limit;
        const query = this.model.find(searchTerms.filters, searchTerms.projection, searchTerms.options);
        query.setOptions({language: searchTerms.locale});
        if (this._session) {
            query.session(this._session);
        }
        if (searchTerms.read) {
            query.read(searchTerms.read);
        }
        const cursor = query.cursor();
        let doc: T;
        while (doc = await cursor.next()) {
            yield doc;
        }
        await cursor.close();
    }

    async retrieve(terms: IQuery): Promise<IPaginatedResults<T>> {
        const st = Query.clone(terms);
        st.searchIn(this.textFields);
        if (st.options.autopopulate && !st.options.populate.length && this.autopopulate.length) {
            st.options.populate = this.autopopulate;
        }
        if (st.options.limit === undefined) {
            const docs: T[] = await this.find(st);
            return this.emptyPaginatedResults(docs);
        } else {
            st.setProjectionForPaginate();
            // Warning! no session
            return await this.model.paginate(st.filters, {...st.options, collation: { locale: st.locale }});
        }
    }

    /**
     * Returns the document that has the maximum value of the given field.
     * You can also send searchTerms as second parameter to filter or project specific fields of the result.
     */
    async max(field: keyof T|string, searchTerms?: IQuery): Promise<Partial<T>> {
        if (!searchTerms) {
            searchTerms = Query.fromScratch();
        }
        searchTerms.options.sort = {
            [field]: -1
        };
        return this.model.findOne<T>(searchTerms.filters, searchTerms.projection, searchTerms.options);
    }

    /**
     * Returns the document that has the minimum value of the given field.
     * You can also send searchTerms as second parameter to filter or project specific fields of the result.
     */
    async min(field: keyof T|string, searchTerms?: IQuery): Promise<Partial<T>> {
        if (!searchTerms) {
            searchTerms = Query.fromScratch();
        }
        searchTerms.options.sort = {
            [field]: 1
        };
        return this.model.findOne<T>(searchTerms.filters, searchTerms.projection, searchTerms.options);
    }

    async spliceFromArray(filters: Object, props) {
        return this.updateMany(filters, {$pull: cloneDeep(props)});
    }

    async pushToArray(filters: Object, props) {
        return this.updateMany(filters, {$push: cloneDeep(props)});
    }

    async addToSet(filters: Object, props) {
        return this.updateMany(filters, {$addToSet: cloneDeep(props)});
    }

    /**
     * Transaction Ready update of one document
     * @param _id
     * @param item
     */
    async updateOne(_id: string, item: Partial<T>|any): Promise<T> {
        const query = this.model.findByIdAndUpdate(this.toObjectId(_id), item, {new: true});
        if (this._session) {
            query.session(this._session);
        }
        return await query;
    }

    /**
     * Transaction Ready update of one document
     * @param selector
     * @param item
     */
    async updateOneByQuery(selector: object, item: Partial<T>|any): Promise<T> {
        const query = this.model.findOneAndUpdate(selector, item, {new: true});
        if (this._session) {
            query.session(this._session);
        }
        return await query;
    }

    /**
     * Transaction Ready update of many documents
     * ! It returns a write result and not the updated documents
     * @param filters
     * @param props
     */
    async updateMany(filters: any, props: Partial<T>|any): Promise<any> {
        const query = this.model.updateMany(filters, props, {multi: true});
        if (this._session) {
            query.session(this._session);
        }
        return await query.exec();
    }

    async updateManyWithDifferentValues(partials: Partial<T>[], props?: string[]): Promise<any> {
        const query = this.model.bulkWrite(
            partials.map((partial: Partial<T>|any) => {
                let filters: any = {_id: partial._id};
                if (props?.length) {
                    filters = {};
                    props.forEach(prop => {
                        const value = this._getPropertySafely(partial, prop);
                        if (value !== undefined) {
                            filters[prop] = value;
                        }
                    });
                }
                return {
                    updateOne: {
                        filter: {...filters},
                        update: {$set: {...partial}}
                    }
                };
            })
        );
        return await query;
    }

    async updateOrCreateMany(partials: (Partial<T>|any)[], props?: string[]) {
        const query = this.model.bulkWrite(
            partials.map((partial: Partial<T>|any) => {
                let filters: any = partial;
                if (props && props.length) {
                    filters = {};
                    props.forEach(prop => {
                        const value = this._getPropertySafely(partial, prop);
                        if (value !== undefined) {
                            filters[prop] = value;
                        }
                    });
                }
                return {
                    updateOne: {
                        filter: {...filters},
                        update: {$set: {...partial}},
                        upsert: true
                    }
                };
            })
        );
        return await query;
    }

    /**
     * Transaction Ready deletion of one document
     * @param _id string
     */
    async deleteById(_id: string): Promise<T|null> {
        const query = this.model.findByIdAndDelete(this.toObjectId(_id));
        if (this._session) {
            query.session(this._session);
        }
        return await query;
    }

    /**
     * Transaction Ready deletion of one document
     * @param filters
     */
    async deleteOne(filters: any): Promise<boolean> {
        const query = this.model.deleteOne(filters);
        if (this._session) {
            query.session(this._session);
        }
        const result = await query;
        return !!result.deletedCount;
    }

    /**
     * Transaction Ready deletion of many documents
     * @param searchTerms
     */
    async deleteMany(searchTerms: IQuery): Promise<number> {
        const query = this.model.deleteMany(searchTerms.filters);
        if (this._session) {
            query.session(this._session);
        }
        const result: any = await query;
        return result.deletedCount || 0;
    }

    async restore(_id: string): Promise<number> {
        return Promise.resolve(0);
    }

    async distinct(field: keyof T, searchTerms: IQuery): Promise<typeof field[]> {
        if (searchTerms.options.autopopulate && (searchTerms.options.populate && !searchTerms.options.populate.length) && this.autopopulate.length) {
            searchTerms.options.populate = this.autopopulate;
        }
        const query = this.model.distinct(field as string, searchTerms.filters);
        query.setOptions({language: searchTerms.locale});
        if (this._session) {
            query.session(this._session);
        }
        return await query;
    }

    async find(searchTerms: IQuery): Promise<T[]> {
        if (searchTerms.options.autopopulate && (searchTerms.options.populate && !searchTerms.options.populate.length) && this.autopopulate.length) {
            searchTerms.options.populate = this.autopopulate;
        }
        const query = this.model.find(searchTerms.filters, searchTerms.projection, searchTerms.options);
        query.setOptions({language: searchTerms.locale});
        if (this._session) {
            query.session(this._session);
        }
        if (searchTerms.read) {
            query.read(searchTerms.read);
        }
        return await query;
    }

    async findOne(searchTerms: IQuery): Promise<T> {
        // this.model.setDefaultLanguage && this.model.setDefaultLanguage(searchTerms.locale);
        if (searchTerms.options.autopopulate && (searchTerms.options.populate && !searchTerms.options.populate.length) && this.autopopulate.length) {
            searchTerms.options.populate = this.autopopulate;
        }
        const query = this.model.findOne(searchTerms.filters, searchTerms.projection, searchTerms.options);
        query.setOptions({language: searchTerms.locale});
        if (this._session) {
            query.session(this._session);
        }
        if (searchTerms.read) {
            query.read(searchTerms.read);
        }
        return await query;
    }

    async findById(searchTerms: IQuery): Promise<T> {
        // this.model.setDefaultLanguage && this.model.setDefaultLanguage(searchTerms.locale);
        if (searchTerms.options.autopopulate && (searchTerms.options.populate && !searchTerms.options.populate.length) && this.autopopulate.length) {
            searchTerms.options.populate = this.autopopulate;
        }
        const query = this.model.findById(this.toObjectId(searchTerms.id), searchTerms.projection, searchTerms.options);
        query.setOptions({language: searchTerms.locale});
        if (this._session) {
            query.session(this._session);
        }
        if (searchTerms.read) {
            query.read(searchTerms.read);
        }
        return await query;
    }

    async count(searchTerms: IQuery): Promise<number> {
        const query = this.model.countDocuments(searchTerms.filters);
        if (this._session) {
            query.session(this._session);
        }
        if (searchTerms.read) {
            query.read(searchTerms.read);
        }
        return await query;
    }

    /**
     * Transaction Ready save of a document
     * @param item
     */
    async save(item: Partial<T>): Promise<T> {
        if (this._session) {
            return await new this.model(item).save({session: this._session});
        }
        return await new this.model(item).save();
    }

    async updateOrCreate (filters: any, item: Partial<T>|any, options: any = {}): Promise<T> {
        let queryOptions: mongoose.QueryOptions & { upsert: true } = {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        };
        queryOptions = {...queryOptions, ...options};
        if (this._session) {
            queryOptions.session = this._session;
        }
        return this.model.findOneAndUpdate<T>(filters, item, queryOptions);
    }

    make(item: Partial<T>): T {
        return new this.model(item);
    }

    public mapping(modelOnly?: boolean): IMappingResponse {
        return {
            model: this.model.modelName,
            mapping: modelOnly ? null : generate(this.model.schema)
        };
    }

    async populate<T>(docs: T[], st: IQuery): Promise<T[]>;
    async populate<T>(docs: T, st: IQuery): Promise<T>;
    async populate<T>(docs: any, st: IQuery) {
        return this.model.populate(docs, st.options.populate);
    }

    /**
     * Transaction Ready Aggregation
     * @param readPreference number
     * @param args
     */
    public aggregate(args: any[], readPreference?: ReadPreference): mongoose.Aggregate<any[]> {
        const query = this.model.aggregate(args);
        if (this._session) {
            query.session(this._session);
        }
        if (readPreference) {
            query.read(readPreference);
        }
        return query;
    }

    public async aggregatePaginate(aggregation: mongoose.Aggregate<any[]>, searchTerms: IQuery): Promise<IPaginatedResults<any>> {
        this.model.setDefaultLanguage && this.model.setDefaultLanguage(searchTerms.locale);
        if (searchTerms.options.limit === undefined) {
            const docs: any[] = await aggregation;
            return this.emptyPaginatedResults(docs);
        } else {
            return await this.model.aggregatePaginate(aggregation, searchTerms.options);
        }
    }

    public toObjectId(_id: string|any) {
        if (typeof _id !== "string") {
            _id = _id.toString();
        }
        return mongoose.Types.ObjectId.createFromHexString(_id);
    }

    public async startTransaction() {
        this._session = await mongoose.startSession();
        this._session.startTransaction();
    }

    public setSession(session: mongoose.ClientSession) {
        this._session = session;
    }

    public async abortTransaction() {
        if (!this._session) {
            return;
        }
        await this._session.abortTransaction();
        this._session.endSession();
        this._session = null;
    }

    public async commitTransaction() {
        if (!this._session) {
            return;
        }
        await this._session.commitTransaction();
        this._session.endSession();
        this._session = null;
    }

    public emptyPaginatedResults(docs) {
        return {docs: docs, limit: -1, total: docs.length, page: 1, pages: 1, offset: 0, hasNextPage: false, hasPrevPage: false, pagingCounter: 1};
    }

    public setLanguage(item, lang: string) {
        if (Array.isArray(item)) {
            for (let i = 0; i < item.length; i++) {
                this.setLanguage(item[i], lang);
            }
        } else {
            if (item?.setLanguage) {
                item.setLanguage(lang);
            }
            if (item?.toObject) {
                const keys = Object.keys(item.toObject());
                keys.forEach(key => {
                    if (item[key]) {
                        this.setLanguage(item[key], lang);
                    }
                });
            }
        }
        return item;
    }

}
