const WebSocket = require('ws');

// Render proporciona el puerto a través de una variable de entorno. Usamos 8080 como fallback.
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

let tabletSocket = null;
let visorSocket = null;

console.log(`Servidor WebSocket iniciado en el puerto ${PORT}`);
console.log('Esperando conexiones de la tablet y el visor...');

// Función de keep-alive para evitar que Render ponga el servicio a dormir
const keepAliveInterval = setInterval(() => {
    wss.clients.forEach(ws => {
        // Si un cliente no ha respondido al último ping, se considera inactivo.
        if (ws.isAlive === false) {
            console.log('Cliente inactivo detectado, terminando conexión.');
            return ws.terminate();
        }
        // Marcar como potencialmente inactivo y enviar un ping. Se espera un 'pong' como respuesta.
        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000); // Se ejecuta cada 30 segundos

wss.on('connection', (ws) => {
    console.log('Nuevo cliente conectado.');
    ws.isAlive = true; // Un cliente nuevo está vivo por defecto.

    ws.on('pong', () => {
        // El cliente respondió a nuestro ping, así que sigue vivo.
        ws.isAlive = true;
    });

    ws.on('message', (message) => {
        let isJson = false;
        let data = {};

        try {
            // El buffer de Node.js se puede convertir a string para parsear.
            data = JSON.parse(message.toString());
            isJson = true;
        } catch (e) {
            isJson = false;
        }

        if (isJson) {
            // --- MANEJO DE MENSAJES JSON (identificación y comandos) ---
            if (data.type === 'identify') {
                if (data.client === 'tablet') {
                    tabletSocket = ws;
                    console.log('>>> TABLET registrada y lista.');
                    // Avisar al visor que la tablet se ha conectado
                    if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                        visorSocket.send(JSON.stringify({ type: 'status', payload: 'TABLET_CONNECTED' }));
                    }
                } else if (data.client === 'visor') {
                    visorSocket = ws;
                    console.log('>>> VISOR registrado y listo.');
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
                    tabletSocket.send(message); // Reenviamos el buffer/string original
                }
            }
        } else {
            // --- MANEJO DE MENSAJES BINARIOS (IMÁGENES) ---
            // Si no es JSON, debe venir de la tablet y se reenvía al visor
            if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                // Reenviamos la imagen SOLO al visor
                visorSocket.send(message, { binary: true });
            }
        }
    });

    ws.on('close', () => {
        if (ws === tabletSocket) {
            tabletSocket = null;
            console.log('>>> TABLET desconectada.');
            if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                visorSocket.send(JSON.stringify({ type: 'status', payload: 'TABLET_DISCONNECTED' }));
            }
        }
        if (ws === visorSocket) {
            visorSocket = null;
            console.log('>>> VISOR desconectado.');
        }
    });

    ws.on('error', (error) => console.error('Error en un socket:', error));
});

wss.on('close', () => {
    clearInterval(keepAliveInterval);
});
