declare namespace NodeJS {
    export interface Global {
        languages: string[];
        requiredLanguages: string[];
        defaultLanguage: string;
        fallbackLanguage: string;
        prefix: string;
        disableTransactions: boolean;
        pagingLimit: number;
        businessRegistry: { [key: string]: any };
    }
}
