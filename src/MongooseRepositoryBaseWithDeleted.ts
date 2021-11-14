import { Document } from "mongoose";
import MongooseRepositoryBase from "./MongooseRepositoryBase";
import IPaginatedResults from "@ignatisd/cbrm/lib/interfaces/helpers/PaginatedResults";
import Pagination from "@ignatisd/cbrm/lib/helpers/Pagination";
import { IQuery } from "@ignatisd/cbrm/lib/interfaces/helpers/Query";

export default abstract class MongooseRepositoryBaseWithDeleted<T extends Document = any> extends MongooseRepositoryBase<T> {

    async findByIdWithDeleted(searchTerms: IQuery): Promise<T> {

        if (searchTerms.options.autopopulate && !searchTerms.options.populate.length && this.autopopulate.length) {
            searchTerms.options.populate = this.autopopulate;
        }
        return await this.model.findOneWithDeleted({_id: this.toObjectId(searchTerms.id)}, searchTerms.projection, searchTerms.options);
    }

    async findOneWithDeleted(searchTerms: IQuery): Promise<T> {

        if (searchTerms.options.autopopulate && !searchTerms.options.populate.length && this.autopopulate.length) {
            searchTerms.options.populate = this.autopopulate;
        }
        return await this.model.findOneWithDeleted(searchTerms.filters, searchTerms.projection, searchTerms.options);
    }

    async retrieveWithDeleted(searchTerms: IQuery): Promise<IPaginatedResults<T>> {

        if (searchTerms.options.autopopulate && !searchTerms.options.populate.length && this.autopopulate.length) {
            searchTerms.options.populate = this.autopopulate;
        }
        if (searchTerms.options.limit === undefined) {
            const docs: T[] = await this.findWithDeleted(searchTerms);
            return this.emptyPaginatedResults(docs);
        } else {
            // Warning! no session
            searchTerms.setProjectionForPaginate();
            searchTerms.setOption("skip", (searchTerms.options.page - 1) * (searchTerms.options.limit || 0));
            const [results, count] = await Promise.all([
                await this.findWithDeleted(searchTerms),
                await this.countWithDeleted(searchTerms)
            ]);
            return new Pagination()
                .setResults(results)
                .setPage(searchTerms.options.page)
                .setLimit(searchTerms.options.limit)
                .setTotal(count)
                .toObject();
        }
    }

    async countWithDeleted(searchTerms: IQuery): Promise<number> {
        const query = this.model.countDocumentsWithDeleted(searchTerms.filters);
        if (this._session) {
            query.session(this._session);
        }
        if (searchTerms.read) {
            query.read(searchTerms.read);
        }
        return await query;
    }

    async findWithDeleted(searchTerms: IQuery): Promise<T[]> {

        if (searchTerms.options.autopopulate && !searchTerms.options.populate.length && this.autopopulate.length) {
            searchTerms.options.populate = this.autopopulate;
        }
        return await this.model.findWithDeleted(searchTerms.filters, searchTerms.projection, searchTerms.options);
    }

    async softDelete(_id: string): Promise<boolean> {
        const query = this.model.delete({_id: this.toObjectId(_id)});
        if (this._session) {
            query.session(this._session);
        }
        const result: { n: number; ok: number } = await query;
        return result.n > 0;
    }

    async softDeleteOne(filters: any): Promise<boolean> {
        const query = this.model.delete(filters).limit(1);
        if (this._session) {
            query.session(this._session);
        }
        const result: { n: number; ok: number } = await query;
        return result.n > 0;
    }

    async softDeleteMany(searchTerms: IQuery): Promise<number> {
        const query = this.model.delete(searchTerms.filters);
        if (this._session) {
            query.session(this._session);
        }
        const result: { n: number; ok: number } = await query;
        return result.n;
    }

    async restore(_id: string): Promise<number> {
        const result: { n: number; ok: number } = await this.model.restore({_id: this.toObjectId(_id)});
        return result.n;
    }

}
