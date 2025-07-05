// Archivo: server.js (FINAL CON HANDSHAKE PING-PONG)
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

// Se crea un servidor HTTP básico. Render lo necesita para el health check.
const server = http.createServer((req, res) => {
    // Render.com envía pings a esta ruta para saber si el servicio está vivo.
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Server is healthy and running.');
    } else {
        res.writeHead(404).end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });
const clients = new Map(); // Mapa para guardar toda la información de los clientes conectados

console.log(`🚀 SERVIDOR WEBSOCKET INICIADO. Escuchando en el puerto ${PORT}`);

wss.on('connection', (ws) => {
    // Asignamos un ID único a cada conexión para poder identificarla.
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId;
    clients.set(connectionId, { ws: ws }); // Guardamos el websocket en nuestro mapa

    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO. Esperando identificación...`);

    ws.on('message', (message) => {
        // --- CASO 1: El mensaje es binario (una imagen de la tablet) ---
        if (Buffer.isBuffer(message)) {
            const senderInfo = clients.get(ws.id);
            // Solo las tablets pueden enviar imágenes. Si no es una tablet, ignoramos.
            if (!senderInfo || senderInfo.clientType !== 'tablet') return;

            // Reenviamos la imagen a todos los visores que estén mirando esta tablet
            clients.forEach((receiverInfo) => {
                if (receiverInfo.clientType === 'visor' && receiverInfo.tabletId === senderInfo.tabletId && receiverInfo.ws.readyState === WebSocket.OPEN) {
                    receiverInfo.ws.send(message);
                }
            });
            return; // Fin del manejo de imágenes
        }

        // --- CASO 2: El mensaje es texto (JSON con comandos) ---
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`[${ws.id}] ❌ Mensaje no es JSON:`, message.toString());
            return;
        }

        const senderInfo = clients.get(ws.id);
        if (!senderInfo) return; // Si el cliente no está en el mapa, ignoramos

        switch (data.type) {
            // Lógica de Handshake para asegurar que la conexión está viva
            case 'ping':
                console.log(`[${ws.id}] 🏓 Ping recibido. Enviando pong.`);
                ws.send(JSON.stringify({ type: 'pong' }));
                break;

            // El cliente (tablet o visor) se identifica
            case 'identify':
                senderInfo.clientType = data.client; // 'tablet' o 'visor'
                senderInfo.tabletId = data.tabletId || data.targetTabletId; // El ID de la tablet
                console.log(`[${ws.id}] ✅ IDENTIFICADO: Tipo=${senderInfo.clientType}, TabletID=${senderInfo.tabletId}`);
                // Si es la tablet la que se identifica, le confirmamos que todo está OK
                if (senderInfo.clientType === 'tablet') {
                    ws.send(JSON.stringify({ type: 'identified_ok' }));
                }
                break;

            // Comandos de toque/deslizamiento enviados desde el visor
            case 'tap_relative':
            case 'swipe_relative':
                if (senderInfo.clientType !== 'visor') return; // Solo los visores envían comandos
                // Reenviamos el comando a la tablet correspondiente
                clients.forEach((receiverInfo) => {
                    if (receiverInfo.clientType === 'tablet' && receiverInfo.tabletId === senderInfo.tabletId && receiverInfo.ws.readyState === WebSocket.OPEN) {
                        receiverInfo.ws.send(JSON.stringify(data));
                        console.log(`[${ws.id}] 👉 Visor -> Comando '${data.type}' a Tablet ${receiverInfo.tabletId}`);
                    }
                });
                break;
        }
    });

    ws.on('close', () => {
        const clientInfo = clients.get(ws.id);
        const logMsg = clientInfo && clientInfo.clientType ? `Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}` : 'No identificado';
        console.log(`[${ws.id}] 🔌 CLIENTE DESCONECTADO. ${logMsg}`);
        clients.delete(ws.id); // Lo eliminamos del mapa
    });

    ws.on('error', (error) => {
        console.error(`[${ws.id}] 💥 ERROR DE WEBSOCKET:`, error);
        ws.close(); // Cerramos la conexión si hay un error
    });
});

// Iniciamos el servidor HTTP, que a su vez maneja el WebSocket Server
server.listen(PORT, () => console.log(`Servidor HTTP y WebSocket escuchando en el puerto ${PORT}`));
