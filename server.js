const WebSocket = require('ws');

// Render te proporcionará el puerto a través de la variable de entorno process.env.PORT
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

let tabletSocket = null;
let visorSocket = null;

console.log(`Servidor WebSocket iniciado en el puerto ${PORT}`);
console.log('Esperando conexiones...');

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`Nuevo cliente conectado desde: ${clientIp}`);

    ws.on('message', (message) => {
        // Asumimos que el mensaje es binario (imagen) a menos que sea un JSON válido
        let isJson = false;
        let data = {};

        try {
            // Intentamos parsear como texto JSON primero
            data = JSON.parse(message);
            isJson = true;
        } catch (e) {
            // No es JSON, debe ser una imagen (Blob/Buffer)
            isJson = false;
        }

        if (isJson) {
            // --- MANEJO DE MENSAJES JSON ---
            if (data.type === 'identify') {
                if (data.client === 'tablet') {
                    tabletSocket = ws;
                    console.log('>>> TABLET registrada.');
                    // Avisar al visor que la tablet se ha conectado
                    if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                        visorSocket.send(JSON.stringify({ type: 'status', payload: 'TABLET_CONNECTED' }));
                    }
                } else if (data.client === 'visor') {
                    visorSocket = ws;
                    console.log('>>> VISOR registrado.');
                    // Avisar al visor si la tablet ya estaba conectada
                    if (tabletSocket && tabletSocket.readyState === WebSocket.OPEN) {
                         visorSocket.send(JSON.stringify({ type: 'status', payload: 'TABLET_ALREADY_CONNECTED' }));
                    }
                }
            } 
            // Si es un comando de clic, viene del visor y se reenvía a la tablet
            else if (data.type === 'tap_relative' || data.type === 'swipe_relative') {
                if (tabletSocket && tabletSocket.readyState === WebSocket.OPEN) {
                    // Reenviamos el comando de texto SOLO a la tablet
                    tabletSocket.send(message); // Reenviamos el mensaje original
                } else {
                    console.log('Se recibió un comando de clic, pero no hay ninguna tablet conectada.');
                }
            }
        } else {
            // --- MANEJO DE MENSAJES BINARIOS (IMÁGENES) ---
            // Si es binario, debe venir de la tablet y se reenvía al visor
            if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                // Reenviamos la imagen SOLO al visor
                visorSocket.send(message, { binary: true });
            }
        }
    });

    ws.on('close', () => {
        // Limpiamos la referencia al socket que se desconectó
        if (ws === tabletSocket) {
            tabletSocket = null;
            console.log('>>> TABLET desconectada.');
            // Avisar al visor que la tablet se ha desconectado
            if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                visorSocket.send(JSON.stringify({ type: 'status', payload: 'TABLET_DISCONNECTED' }));
            }
        }
        if (ws === visorSocket) {
            visorSocket = null;
            console.log('>>> VISOR desconectado.');
        }
        console.log('Cliente desconectado.');
    });

    ws.on('error', (error) => {
        console.error('Error en un socket:', error);
    });
});
