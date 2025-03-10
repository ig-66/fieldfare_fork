/**
 * Fieldfare: Backend framework for distributed networks
 *
 * Copyright 2021-2023 Adan Kvitschal
 * ISC LICENSE
 */

import { ChunkManager } from '../chunking/ChunkManager.js';
import { TreeContainer } from './TreeContainer.js';

export class TreeBranch {

    /**
     * 
     * @param {string} origin Branch origin chunk identifier in base64 format
     * @param {string} ownerID Branch owner ID in base64 format
     */
    constructor(origin, ownerID) {
        this.ownerID = ownerID;
        this.origin = origin;
        this.depth = 0;
        this.containerKeys = [];
        this.containers = [];
        this.containsKey = false;
    }

    getLastContainer() {
        return this.containers[this.depth-1];
    }

    append(other) {
        this.depth += other.depth;
        this.containers = [...this.containers, ...other.containers];
        this.containerKeys = [...this.containerKeys, ...other.containerKeys];
        this.key = other.key;
        this.containsKey = other.containsKey;
    }

    async getToKey(key) {
        this.key = key;
        this.depth = 0;
        var nextContainerKey = this.origin;
        while(nextContainerKey !== '') {
            const iContainer = await TreeContainer.fromChunkIdentifier(nextContainerKey, this.ownerID);
            if(iContainer === null
            || iContainer === undefined) {
                throw Error('iContainer object not found');
            }
            this.depth++;
            this.containerKeys.push(nextContainerKey);
            this.containers.push(iContainer);
            nextContainerKey = iContainer.follow(key);
            if(nextContainerKey === true) {
                this.containsKey = true;
                break;
            }
        }
        return this;
    }

    async getToLeftmostLeaf() {
        var nextContainerKey = this.origin;
        this.depth = 0;
        while(nextContainerKey !== '') {
            const iContainer = await TreeContainer.fromChunkIdentifier(nextContainerKey, this.ownerID);
            this.depth++;
            this.containerKeys.push(nextContainerKey);
            this.containers.push(iContainer);
            nextContainerKey = iContainer.getLeftmostChild();
        }
    }

    async getToRightmostLeaf() {
        var nextContainerKey = this.origin;
        this.depth = 0;
        while(nextContainerKey !== '') {
            const iContainer = await TreeContainer.fromChunkIdentifier(nextContainerKey, this.ownerID);
            this.depth++;
            this.containerKeys.push(nextContainerKey);
            this.containers.push(iContainer);
            nextContainerKey = iContainer.getRightmostChild();
        }
    }

    async split(maxElements) {
        var iContainer = this.containers[this.depth-1];
        var depth = this.depth;
        var isMap = false;
        if(iContainer.values) {
            isMap = true;
        }
        while(iContainer.numElements === maxElements) {
            const rightContainer = new TreeContainer(null, isMap);
            const meanElement = iContainer.split(rightContainer);
            const leftContainer = iContainer;
            const prevLeftContainerKey = this.containerKeys[depth-1];
            const newLeftContainerKey = await ChunkManager.storeObjectAsChunk(leftContainer);
            const rightContainerKey = await ChunkManager.storeObjectAsChunk(rightContainer);
            if(depth > 1) {
                depth--;
                iContainer = this.containers[depth-1];
                iContainer.updateChild(prevLeftContainerKey, newLeftContainerKey);
                iContainer.add(meanElement, rightContainerKey);
            } else {
                //ROOT SPLIT
                const newRoot = new TreeContainer(newLeftContainerKey, isMap);
                newRoot.add(meanElement, rightContainerKey);
                this.containerKeys.unshift('');
                this.containers.unshift(newRoot);
                this.depth++;
//					logger.log('info', "New tree root: " + JSON.stringify(newRoot, null , 2)
//						+ " -> " + this.containers[0]);
                break;
            }
        }
        return depth;
    }

    async rebalance(minElements) {
        var depth = this.depth;
        var isMap = false;
        const lastContainer = this.getLastContainer();
        if(lastContainer.values) {
            isMap = true;
        }
        while(depth > 1) {
            const iContainerKey = this.containerKeys[depth-1]
            const iContainer = this.containers[depth-1];
            const parentContainer = this.containers[depth-2];
            if(iContainer.numElements < minElements) {
                const [leftSiblingKey, leftElement] = parentContainer.getLeftSibling(iContainerKey);
                const [rightSiblingKey, rightElement] = parentContainer.getRightSibling(iContainerKey);
                var leftSibling = {numElements:0};
                var rightSibling = {numElements:0};
                if(leftSiblingKey === '' && rightSiblingKey === '') {
                    throw Error('container has no siblings');
                }
                if(leftSiblingKey !== '') {
                    leftSibling = await TreeContainer.fromChunkIdentifier(leftSiblingKey, this.ownerID);
                }
                if(rightSiblingKey !== '') {
                    rightSibling = await TreeContainer.fromChunkIdentifier(rightSiblingKey, this.ownerID);
                }
                if(leftSibling.numElements >= rightSibling.numElements) {
                    var leftKey;
                    if(isMap) {
                        leftKey = leftElement[0];
                    } else {
                        leftKey = leftElement;
                    }
                    if(leftSibling.numElements > minElements) {
                        //rotate from left
                        const [rotatedElement, rotatedChildKey] = leftSibling.pop();
                        parentContainer.substituteElement(leftKey, rotatedElement);
                        const newLeftSiblingKey = await ChunkManager.storeObjectAsChunk(leftSibling);
                        parentContainer.updateChild(leftSiblingKey, newLeftSiblingKey);
                        iContainer.unshift(leftElement, rotatedChildKey);
                        const newContainerKey = await ChunkManager.storeObjectAsChunk(iContainer);
                        parentContainer.updateChild(iContainerKey, newContainerKey);
                    } else {
                        //merge around left key
                        iContainer.mergeLeft(leftSibling, leftElement);
                        const mergedChildKey = await ChunkManager.storeObjectAsChunk(iContainer);
                        const parentNumElements = parentContainer.mergeChildren(leftKey, mergedChildKey);
                        if(parentNumElements == 0) {
                            debugger;
                            this.containers.shift();
                            this.containerKeys.shift();
                            this.depth--;
                            depth--;
                        }
                    }
                } else {
                    var rightKey;
                    if(isMap) {
                        rightKey = rightElement[0];
                    } else {
                        rightKey = rightElement;
                    }
                    if(rightSibling.numElements > minElements) {
                        //rotate from right
                        const [rotatedElement, rotatedChildKey] = rightSibling.shift();
                        parentContainer.substituteElement(rightKey, rotatedElement);
                        const newRightSiblingKey = await ChunkManager.storeObjectAsChunk(rightSibling);
                        parentContainer.updateChild(rightSiblingKey, newRightSiblingKey);
                        iContainer.push(rightElement, rotatedChildKey);
                        const newContainerKey = await ChunkManager.storeObjectAsChunk(iContainer);
                        parentContainer.updateChild(iContainerKey, newContainerKey);
                    } else {
                        //merge around right key
                        iContainer.mergeRight(rightSibling, rightElement);
                        const mergedChildKey = await ChunkManager.storeObjectAsChunk(iContainer);
                        const parentNumElements = parentContainer.mergeChildren(rightKey, mergedChildKey);
                        if(parentNumElements == 0) {
                            debugger;
                            this.containers.shift();
                            this.containerKeys.shift();
                            this.depth--;
                            depth--;
                        }
                    }
                }
                depth--;
                debugger;
            } else {
                break;
            }
        }
        return depth;
    }

    async update(pDepth) {
        var depth = pDepth;
        if(pDepth === undefined) {
            depth = this.depth;
        }
        if(this.containers[0].numElements > 0) { //removed last element from list?
            while(depth > 1) {
                const parentContainer = this.containers[depth-2];
                const iContainer = this.containers[depth-1];
                const prevContainerKey = this.containerKeys[depth-1];
                const newContainerKey = await ChunkManager.storeObjectAsChunk(iContainer);
                this.containerKeys[depth-1] = newContainerKey;
                // if(prevContainerKey !== newContainerKey) {
                    parentContainer.updateChild(prevContainerKey, newContainerKey);
                // }
                depth--;
            }
            this.containerKeys[0] = await ChunkManager.storeObjectAsChunk(this.containers[0]);
        } else {
            this.depth = 0;
            this.containerKeys[0] = null;
        }
        return this.containerKeys[0];
    }
}
