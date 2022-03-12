import "mongoose-paginate-v2";
import { EnforceDocument, PaginateModel, Aggregate } from "mongoose";
import IPaginatedResults from "@ignatisd/cbrm/lib/interfaces/helpers/PaginatedResults";
import { IQueryOptions } from "@ignatisd/cbrm/lib/interfaces/helpers/Query";

export default interface IPaginatable<T extends EnforceDocument<any, any, any>> extends PaginateModel<T> {
    setDefaultLanguage(lang: string);
    aggregatePaginate(aggregation: Aggregate<any[]>, opts: IQueryOptions): IPaginatedResults<any>;
}
