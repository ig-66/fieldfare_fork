/**
 * Fieldfare: Backend framework for distributed networks
 *
 * Copyright 2021-2023 Adan Kvitschal
 * ISC LICENSE
 */

import {Transceiver} from '../../trx/Transceiver.js';
import {logger} from '../../basic/Log.js';

export class WebClientTransceiver extends Transceiver {

	constructor() {
		super();


	}

	newChannel(address, port) {

		return new Promise((resolve, reject) => {

			// Create WebSocket connection.
			 const socket = new WebSocket('ws://' + address + ':' + port, 'mhnet');

			var rNewChannel = {
				type: 'wsClient',
				send: (message) => {
					var stringifiedMessage = JSON.stringify(message, message.jsonReplacer);
					//logger.log('info', "calling ws socket send, with message: " + stringifiedMessage);
					socket.send(stringifiedMessage);
				},
				active: () => {
					if(socket.readyState !== WebSocket.OPEN) {
						return false;
					}
					return true;
				},
				info: {
					socket: socket
				}
			}

			// Listen for messages
			socket.addEventListener('message', (event) => {

				var message = event.data;

				if(rNewChannel.onMessageReceived) {

					//logger.log('info', 'WS: Message from server: ' + message);

					try {
						//Convert to object
						var messageObject = JSON.parse(message);

						rNewChannel.onMessageReceived(messageObject);

					} catch (error) {
						logger.log('info', "Failed to parse message: " + error);
					}

				}

			});

			rNewChannel.onMessageReceived = (message) => {
				logger.log('info', 'WS channel onMessageReceived: no message parser assigned, discarding');
			};

			// Connection opened
			socket.addEventListener('open', (event) => {

				logger.log('info', 'WebSocket client opened: ' + JSON.stringify(event));
				resolve(rNewChannel);

			});

			socket.addEventListener('error', (event) => {

				logger.log('info', 'WebSocket client error!');
				reject(JSON.stringify(event));

			});

		});
	}

};
