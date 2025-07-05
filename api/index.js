const { Server } = require('ws');

// Vercel exporta esta función y la ejecuta como una "Serverless Function".
// El servidor HTTP es manejado por Vercel.
module.exports = (req, res) => {
    // Creamos un WebSocket Server sin servidor propio, ya que Vercel provee uno.
    const wss = new Server({ noServer: true });

    const clients = new Map();
    console.log("🚀 Servidor WebSocket adjuntándose a la solicitud HTTP de Vercel...");

    // Cuando el servidor de Vercel recibe una solicitud para "ascender" a WebSocket...
    res.socket.server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

    wss.on('connection', (ws) => {
        const connectionId = Math.random().toString(36).substring(2, 9);
        ws.id = connectionId;
        clients.set(connectionId, { ws: ws });
        console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO.`);

        // Responde a los pings de bajo nivel de OkHttp para mantener la conexión viva.
        ws.on('ping', () => {
            console.log(`[${connectionId}] ❤️ Ping de keep-alive recibido. Respondiendo pong.`);
            ws.pong();
        });

        // Maneja los mensajes entrantes.
        ws.on('message', (message) => {
            // Manejo de imagen binaria (de la tablet).
            if (Buffer.isBuffer(message)) {
                const senderInfo = clients.get(ws.id);
                if (!senderInfo || senderInfo.clientType !== 'tablet') return;
                // Reenvía la imagen a todos los visores que estén viendo esta tablet.
                clients.forEach((receiverInfo) => {
                    if (receiverInfo.clientType === 'visor' && receiverInfo.tabletId === senderInfo.tabletId && receiverInfo.ws.readyState === 1) { // 1 es WebSocket.OPEN
                        receiverInfo.ws.send(message);
                    }
                });
                return;
            }
            
            // Manejo de mensaje de texto (JSON con comandos).
            let data;
            try { 
                data = JSON.parse(message.toString());
            } catch (e) { 
                console.error(`[${ws.id}] ❌ Mensaje no es JSON válido.`); 
                return; 
            }

            const senderInfo = clients.get(ws.id);
            if (!senderInfo) return;

            switch (data.type) {
                // Ping de handshake de nuestra aplicación.
                case 'ping':
                    console.log(`[${ws.id}] 🏓 Ping de aplicación recibido. Enviando pong.`);
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
                // El cliente se identifica.
                case 'identify':
                    senderInfo.clientType = data.client;
                    senderInfo.tabletId = data.tabletId || data.targetTabletId;
                    console.log(`[${ws.id}] ✅ IDENTIFICADO: Tipo=${senderInfo.clientType}, TabletID=${senderInfo.tabletId}`);
                    if (senderInfo.clientType === 'tablet') {
                        ws.send(JSON.stringify({ type: 'identified_ok' }));
                    }
                    break;
                // El visor envía un comando de toque o deslizamiento.
                case 'tap_relative':
                case 'swipe_relative':
                     if (senderInfo.clientType !== 'visor') return;
                     clients.forEach((receiverInfo) => {
                         if (receiverInfo.clientType === 'tablet' && receiverInfo.tabletId === senderInfo.tabletId && receiverInfo.ws.readyState === 1) {
                             receiverInfo.ws.send(JSON.stringify(data));
                             console.log(`[${ws.id}] 👉 Visor -> Comando '${data.type}' a Tablet ${receiverInfo.tabletId}`);
                         }
                     });
                     break;
            }
        });

        // Maneja el cierre de la conexión.
        ws.on('close', () => {
            const clientInfo = clients.get(ws.id);
            const logMsg = clientInfo && clientInfo.clientType ? `Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}` : 'No identificado';
            console.log(`[${ws.id}] 🔌 CLIENTE DESCONECTADO. ${logMsg}`);
            clients.delete(ws.id);
        });

        // Maneja errores.
        ws.on('error', (error) => {
            console.error(`[${ws.id}] 💥 ERROR DE WEBSOCKET:`, error);
            ws.close();
        });
    });
    
    // Vercel necesita que la función HTTP termine, pero la conexión WebSocket es persistente.
    // Respondemos a la solicitud HTTP inicial para que Vercel sepa que todo está bien.
    if (!res.writableEnded) {
        res.status(200).send("Servidor WebSocket listo para upgrade.");
    }
};
