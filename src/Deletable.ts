import { Document, Types } from "mongoose";

export interface IDeletable<T extends Document<Types.ObjectId>> {

    findDeleted?(...args): any;
    findWithDeleted?(...args): any;

    findOneDeleted?(...args): any;
    findOneWithDeleted?(...args): any;

    findOneAndUpdateDeleted?(...args): any;
    findOneAndUpdateWithDeleted?(...args): any;

    updateDeleted?(...args): any;
    updateWithDeleted?(...args): any;

    countDocumentsDeleted?(...args): any;
    countDocumentsWithDeleted?(...args): any;

    countDeleted?(...args): any;
    countWithDeleted?(...args): any;

    restore?(...args): any;
    delete?(...args): any;

}

