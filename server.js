const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

let tabletSocket = null;
let visorSocket = null;

console.log('Servidor WebSocket iniciado y esperando conexiones...');

wss.on('connection', (ws) => {
    console.log('Cliente conectado.');

    ws.on('message', (message) => {
        try {
            // Primero, intentamos parsear como JSON para la identificación
            const data = JSON.parse(message);

            if (data.type === 'identify') {
                if (data.client === 'tablet') {
                    tabletSocket = ws;
                    console.log('>>> Tablet identificada y registrada.');
                    // Informar al visor si ya está conectado
                    if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                        visorSocket.send(JSON.stringify({ type: 'status', message: 'Tablet Conectada' }));
                    }
                } else if (data.client === 'visor') {
                    visorSocket = ws;
                    console.log('>>> Visor identificado y registrado.');
                     // Informar al visor si la tablet ya está conectada
                    if (tabletSocket && tabletSocket.readyState === WebSocket.OPEN) {
                        visorSocket.send(JSON.stringify({ type: 'status', message: 'Tablet ya estaba Conectada' }));
                    }
                }
                return; // Mensaje de identificación procesado
            }

            // Si el mensaje es un comando de TAP/SWIPE, debe venir del visor
            if (data.type === 'tap_relative' || data.type === 'swipe_relative') {
                if (tabletSocket && tabletSocket.readyState === WebSocket.OPEN) {
                    // Reenviamos el comando SOLO a la tablet
                    tabletSocket.send(JSON.stringify(data));
                }
            }

        } catch (e) {
            // Si no es JSON, asumimos que es una imagen (un Blob)
            // Esto debe venir de la tablet
            if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                // Reenviamos la imagen SOLO al visor
                visorSocket.send(message);
            }
        }
    });

    ws.on('close', () => {
        console.log('Cliente desconectado.');
        // Limpiamos la referencia al socket que se desconectó
        if (ws === tabletSocket) {
            tabletSocket = null;
            console.log('>>> Tablet desconectada.');
            if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                visorSocket.send(JSON.stringify({ type: 'status', message: 'Tablet Desconectada' }));
            }
        }
        if (ws === visorSocket) {
            visorSocket = null;
            console.log('>>> Visor desconectado.');
        }
    });

    ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
    });
});
