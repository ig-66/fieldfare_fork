/**
 * Fieldfare: Backend framework for distributed networks
 *
 * Copyright 2021-2023 Adan Kvitschal
 * ISC LICENSE
 */

import { ChunkManager } from "./ChunkManager.js";
import { ChunkingUtils } from "./ChunkingUtils.js";
import { Utils } from "../basic/Utils.js";

export class Chunk {

    constructor() {
        /**
         * Chunk identifier in base64 format, preceeded by chunk prefix
         * @type {string}
         * @public
         */
        this.id = undefined;
    }

    static null() {
        return new Chunk();
    }

    /**
     * Build Chunk from its indentifier. If teh identifier is null or
     * a null string like '', the function will return null.
     * @param {string} id chunk identifier in base64 format plus prefix
     * @param {string} owner remote chunk owner ID in base64 format
     * @returns new Chunk object assigned to given key
     */    
    static fromIdentifier(id, ownerID) {
        const newChunk = new Chunk;
        if(id
        && id !== null
        && id !== '') {
            ChunkingUtils.validateIdentifier(id);
            newChunk.id = id;
            newChunk.ownerID = ownerID;
        }
        return newChunk;
    }

    /**
     * Get the chunk contents from local or remote source using the identifier
     * and owner from chunk properties. The contents are also stored inside the chunk
     * instance for later use and recovered on each successive fetch() call.
     * @returns the chunk contents in base64 format
     */
    async fetch() {
        if(this.data === undefined)  {
            try {
                this.data = await ChunkManager.getLocalChunkContents(this.id);
                this.local = true;
            } catch(error) {
                if(error.name !== 'NOT_FOUND_ERROR') {
                    throw error;
                }
                //logger.log('info', "res.fetch: Not found locally. Owner: " + owner);
                if(this.ownerID === null
                || this.ownerID === undefined) {
                    //Owner not know, fail
                    var error = Error('chunk not found locally, owner unknown: ' + this.id);
                    error.name = 'NOT_FOUND_ERROR';
                    throw error;
                }
                this.data = await ChunkManager.getRemoteChunkContents(this.id, this.ownerID);
                this.local = false;    
            }
        }
        return this.data;
    }

    /**
     * Construct a new Chunk by casting the given  object to a string 
     * in base64 format and stores the result in the local Chunk managers.
     * @param {Object} object 
     * @returns Chunk created from object contents
     */
    static async fromObject(object) {
        const newChunk = new Chunk;
        newChunk.local = true;
        const json = JSON.stringify(object, (key, value) => {
            if(value instanceof Chunk) {
                return value.id;
            }
            return value;
        });
        const utf8ArrayBuffer = Utils.strToUtf8Array(json);
		newChunk.data = Utils.uint8ArrayToBase64(utf8ArrayBuffer);
        newChunk.id = await ChunkManager.storeChunkContents(newChunk.data);
        return newChunk;
    }

    /**
     * Call the replacer method for every chunk inside an object that is an 
     * instance of Chunk, replacing the property value in place with the value returned
     * from the replacer method. The replacer method takes two parameters
     * (key, value) of each property that isn an instance of Chunk, and the value
     * returned by the method is substituted in the object.
     * @param {Object} object object in which properties will be replaced
     * @param {Function} replacer the method called for every instance fo Chunk
     */
    static async replaceChunks(object, replacer) {
        for(const key in object) {
            const value = object[key];
            if(value instanceof Chunk) {
                object[key] = await replacer(key, value);
            } else
            if(value instanceof Object) {
                await Chunk.replaceChunks(value, replacer);
            }
        }
    }

    /**
     * Expand chunk to a JavaScript object, following object properties 
     * that are recognized as chunk identifiers and transforming them to 
     * Chunk objects. If depth is equal to zero, the 
     * identifiers are kept as strings in base64 format plus prefix.
     * @param {integer} depth Depth to which the algorithm iterates nested
     * objects expanding chunk identifiers, where zero will keep all identifiers
     * in their original form.
     * @returns an Object containing all properties recovered from the chunk data
     */
    async expand(depth=0) {
        if(this.id === null
        || this.id === undefined) {
            return null;
        }
        const base64data = await this.fetch();
        const json = atob(base64data);
        var object;
        if(depth > 0) {
            var someChunk = false;
            object = JSON.parse(json, (key, value) => {
                if(ChunkingUtils.isValidIdentifier(value)) {
                    const chunk = Chunk.fromIdentifier(value);
                    someChunk = true;
                    return chunk;
                }
                return value;
            });
            if(someChunk) {
                await Chunk.replaceChunks(object, async (key, value) => {
                    if(depth > 1) {
                        return (await value.expand(depth-1));
                    }
                    return value;
                });
            }            
        } else {
            object = JSON.parse(json);
        }
        return object;
    }

}