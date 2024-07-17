#!/usr/bin/env node

import { access, mkdir } from "fs/promises";
import { constants, existsSync, writeFileSync } from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// TODO: move to server env
const TG_API_KEY = process.env.TG_API_KEY;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

import TelegramBot from "node-telegram-bot-api";

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

async function asyncMap(array, callback) {
    return await Promise.all(array.map(async (i) => {
        return await callback(i);
    }));
}

const argv = yargs(hideBin(process.argv))
    .option('vpNum', {
        alias: 'n',
        description: 'get info for vpNum',
        type: 'string',
    })
    .option('secret', {
        alias: 's',
        description: 'secret code',
        type: 'string',
    })
    .option('downloadDocument', {
        alias: 'd',
        description: 'download document by id',
        type: 'string',
    })
    .option('forceRewriteDocuments', {
        alias: 'f',
        description: 'force rewrite document if it is exists',
        type: 'boolean',
    })
    .option('verbose', {
        alias: 'v',
        description: 'show debug messages',
        type: 'boolean',
    })
    .help()
    .alias('help', 'h')
    .argv;

const DEBUG = !!argv.verbose;
const SECRET = argv.secret;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36';

const OUT_DIR = './out/';

const BASE_URL = 'https://asvpweb.minjust.gov.ua';

const API_REQ_HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.5",
    'accept-encoding': 'gzip, deflate, br',
    'user-agent': USER_AGENT,
    'origin': BASE_URL,
    'connection': 'keep-alive',
    "cache-control": "no-cache",
    "content-type": "application/json",
    "pragma": "no-cache",
    "sec-ch-ua": "\" Not;A Brand\";v=\"99\", \"Google Chrome\";v=\"91\", \"Chromium\";v=\"91\"",
    "sec-ch-ua-mobile": "?0",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    'DNT': '1',
    'TE': 'trailers'
};

const doAjax = async filter => {
    logger.log(`ajax call for filter:`, filter);

    const body = {
        "filter": filter,
        "reCaptchaToken": "",
        "reCaptchaAction": "view_document"
    };

    const response = await fetch('https://asvpweb.minjust.gov.ua/sptDataEndpoint', {
        "headers": API_REQ_HEADERS,
        "referrer": "https://asvpweb.minjust.gov.ua/",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": JSON.stringify(body),
        "method": "POST",
        "mode": "cors"
    });

    if (response.ok) {
        const jsonValue = await response.json(); // Get JSON value from the response body
        return Promise.resolve(jsonValue);
    } else {
        return Promise.reject('***error');
    }
};

const getAllData = async vId => {
    try {
        const { mParams } = await doAjax({
            "VpNum": vId,
            "SecretNum": SECRET,
            "dataType": "getSharedInfoByVP"
        });
        return mParams;
    } catch(e) {
        return null;
    }
};

const getDocument = async docId => {
    logger.info(`fetching document with ${docId}/${SECRET}`);

    try {
        const { mParams } = await doAjax({
            "ID": docId,
            "SecretNum": SECRET,
            "dataType":"otherDecisionDocument",
            "isArtm":false
        });
        return mParams;
    } catch(e) {

    }
};

const isFileExists = async filePath => {
    try {
        await access(filePath, constants.F_OK | constants.R_OK);
        return Promise.resolve(true);
    } catch {
        return Promise.resolve(false);
    }
};

const saveDocumentFile = async (fileName, document) => {
    const filePath = path.resolve(OUT_DIR, fileName);
    if (await isFileExists(filePath))
    {
        logger.log(`document #${fileName} already exists.`);

        if (!argv.forceRewriteDocuments) {
            logger.log(`skipping... use -f in order to force rewrite`);
            return;
        }
    }

    const rawData = Buffer.from(document, 'base64');

    writeFileSync(filePath, rawData);
    logger.log(`document ${fileName} saved.`);
    await sendDocumentToTelegram({
        path: filePath,
        data: rawData
    });
    return filePath;
};

const downloadDocumentById = async id => {
    const documentData = await getDocument(id);
    logger.info(`fetched document ID: ${id}`, documentData);
    if (!documentData) {
        logger.error(`empty response for document ID: ${id}`);
        return;
    }
    return await saveDocumentFile(`${id}_${documentData.fileName}`, documentData.data);
};

const downloadDocuments = async documents => {
    logger.log(`start downloading ${documents.length} documents`);

    return await asyncMap(documents, async (document) => {
        logger.log(`fetching document:`);
        logger.log(document);

        return await downloadDocumentById(document.id);
    });
};

const logger = new function logger() {
    this._main = DEBUG ? (type, args) => console[type].apply(console, args) : () => {};

    return {
        log: (...args) => this._main('log', args),
        info: (...args) => this._main('info', args),
        warn: (...args) => this._main('warn', args),
        error: (...args) => this._main('error', args)
    };
};

const sendDocumentToTelegram = async document => {
    const bot = new TelegramBot(TG_API_KEY, {polling: true})
    const fileName = path.basename(document.path)

    const fileOptions = {
        filename: fileName,
        contentType: 'application/pdf',
    };

    try {
        return await bot.sendDocument(TG_CHAT_ID, document.data, {}, fileOptions);
    } catch(e) {

    }
}

// the Main function
(async() => {

    const vpNum = argv.vpNum;

    // for '-s' parameter
    if (!SECRET) {
        logger.error("missing secret parameter. exiting.");
        return;
    }

    // for '-n' parameter
    if (!argv.downloadDocument && !vpNum) {
        logger.error("missing vpNum parameter. exiting.");
        return;
    }

    // for '-d' parameter
    if (argv.downloadDocument) {
        argv.forceRewriteDocuments = true;
        const path = await downloadDocumentById(argv.downloadDocument);
        console.log(path);
        return process.exit();
    }

    if (!existsSync(OUT_DIR))
        await mkdir(OUT_DIR);

    const getSharedInfoByVPFilename = `getSharedInfoByVP_${vpNum}_${SECRET}.json`;
    const getSharedInfoByVPFilePath = path.resolve(OUT_DIR, getSharedInfoByVPFilename);

    const data = await getAllData(vpNum);

    if (!data) {
        logger.info('Base result is empty')
        return process.exit();
    }

    writeFileSync(getSharedInfoByVPFilePath, JSON.stringify(data));

    logger.log(`Base result for ${vpNum}/${SECRET} saved to: ${getSharedInfoByVPFilePath}`);

    const { otherDocs } = data;

    let savedDocs = await downloadDocuments(otherDocs);

    savedDocs = savedDocs.filter(i => !!i);

    if (!savedDocs.length)
        return;

    savedDocs.forEach(i => console.log(i));

    return process.exit()
})();
