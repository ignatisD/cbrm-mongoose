import "mongoose-paginate-v2";
import { Document, PaginateModel, Aggregate, Types } from "mongoose";
import { IPaginatedResults, IQueryOptions } from "@ignatisd/cbrm";

export interface IPaginatable<T extends Document<Types.ObjectId>> extends PaginateModel<T> {
    setDefaultLanguage(lang: string);
    aggregatePaginate(aggregation: Aggregate<any[]>, opts: IQueryOptions): IPaginatedResults<any>;
}
