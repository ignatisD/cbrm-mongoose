import { Application } from "express";
import { Schema } from "mongoose";

export interface IConnector {

    onAppReady: (app?: Application) => Promise<any>;
    init: (options: any) => Promise<any>;
    onDisconnect: () => Promise<void>;
    plugins: (plugins: {fn: (schema: Schema, opts?: any) => void; opts?: any}[]) => void;
}
