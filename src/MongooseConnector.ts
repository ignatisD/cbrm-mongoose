import { disconnect, plugin, connect, ConnectOptions, Schema } from "mongoose";
import { IConnector } from "@ignatisd/cbrm/lib/interfaces/helpers/Connector";
import { Application } from "express";

export class MongooseConnector implements IConnector {

    protected _uri: string = "mongodb://localhost:27017/test";
    protected _options: ConnectOptions = <ConnectOptions>{
        socketTimeoutMS: 600000
    };
    protected _db: Promise<any> = new Promise(() => void 0);

    constructor() {}

    public init(opts: { uri: string; options?: ConnectOptions }) {
        this._uri = opts.uri;
        if (opts.options) {
            this._options = opts.options;
        }
        // Mongoose connect (Promise)
        this._db = connect(this._uri, this._options);
        return this._db;
    }

    public plugins(plugins: {fn: (schema: Schema, opts?: any) => void; opts?: any}[] = []) {
        for (let p of plugins) {
            plugin(p.fn, p.opts);
        }
    }

    public onAppReady(app?: Application) {
        return this._db;
    }

    public onDisconnect() {
        return disconnect();
    }
}
