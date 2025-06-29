const WebSocket = require('ws');

// Render proporciona el puerto a través de una variable de entorno.
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

let tabletSocket = null;
let visorSocket = null;

console.log(`[INFO] Servidor WebSocket iniciado en el puerto ${PORT}`);
console.log('[INFO] Esperando conexiones de la tablet y el visor...');

wss.on('connection', (ws) => {
    console.log('[CONNECTION] Nuevo cliente conectado.');
    ws.isAlive = true; // Marcar cliente como vivo al conectar

    // Manejar respuesta al ping para mantenerlo vivo
    ws.on('pong', () => {
        ws.isAlive = true;
        // console.log('[DEBUG] Pong recibido de un cliente.'); // Descomentar para depuración detallada
    });

    ws.on('message', (message) => {
        let isJson = false;
        let data = {};
        const messageAsString = message.toString();

        try {
            data = JSON.parse(messageAsString);
            isJson = true;
        } catch (e) {
            isJson = false;
        }

        if (isJson) {
            // --- MANEJO DE MENSAJES JSON (identificación y comandos) ---
            console.log(`[JSON_MSG] Mensaje JSON recibido: ${messageAsString}`);

            if (data.type === 'identify') {
                if (data.client === 'tablet') {
                    tabletSocket = ws;
                    console.log('>>> TABLET registrada y lista.');
                    if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                        visorSocket.send(JSON.stringify({ type: 'status', payload: 'TABLET_CONNECTED' }));
                    }
                } else if (data.client === 'visor') {
                    visorSocket = ws;
                    console.log('>>> VISOR registrado y listo.');
                    if (tabletSocket && tabletSocket.readyState === WebSocket.OPEN) {
                        visorSocket.send(JSON.stringify({ type: 'status', payload: 'TABLET_ALREADY_CONNECTED' }));
                    } else {
                        visorSocket.send(JSON.stringify({ type: 'status', payload: 'TABLET_DISCONNECTED' }));
                    }
                }
            }
            // Comprobar si es un comando de control para reenviar a la tablet
            else if (['tap_relative', 'swipe_relative', 'scroll'].includes(data.type)) {
                console.log(`[COMMAND] Comando '${data.type}' recibido del visor.`);
                if (tabletSocket && tabletSocket.readyState === WebSocket.OPEN) {
                    tabletSocket.send(messageAsString); // Reenviar el mensaje original
                    console.log(`[SUCCESS] Comando reenviado a la TABLET.`);
                } else {
                    console.log('[ERROR] Se recibió un comando, pero la TABLET no está conectada o lista.');
                }
            } else {
                console.log(`[WARN] Mensaje JSON de tipo desconocido ignorado: ${data.type}`);
            }

        } else {
            // --- MANEJO DE MENSAJES BINARIOS (IMÁGENES) ---
            // Solo reenviar si el mensaje viene de la tablet identificada
            if (ws === tabletSocket) {
                if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                    visorSocket.send(message, { binary: true });
                }
            } else {
                console.log('[WARN] Mensaje binario recibido de un cliente no identificado como tablet. Ignorado.');
            }
        }
    });

    ws.on('close', () => {
        if (ws === tabletSocket) {
            tabletSocket = null;
            console.log('>>> TABLET desconectada.');
            // Notificar al visor que la tablet ya no está disponible
            if (visorSocket && visorSocket.readyState === WebSocket.OPEN) {
                visorSocket.send(JSON.stringify({ type: 'status', payload: 'TABLET_DISCONNECTED' }));
            }
        }
        if (ws === visorSocket) {
            visorSocket = null;
            console.log('>>> VISOR desconectado.');
        }
        console.log('[CONNECTION] Un cliente se ha desconectado.');
    });

    ws.on('error', (error) => {
        console.error('[ERROR] Error en un socket de cliente:', error);
    });
});

// Sistema de Keep-Alive para evitar que las conexiones se cierren por inactividad
const keepAliveInterval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log('[KEEP_ALIVE] Cliente inactivo detectado. Terminando conexión.');
            return ws.terminate();
        }
        ws.isAlive = false; // Asumir que está inactivo hasta que responda con 'pong'
        ws.ping(() => {});
    });
}, 30000); // Enviar un ping a todos los clientes cada 30 segundos

wss.on('close', () => {
    console.log('[INFO] El servidor WebSocket se está cerrando.');
    clearInterval(keepAliveInterval);
});

console.log('[INFO] Lógica del servidor y listeners configurados.');
