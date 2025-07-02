// Archivo: server.js
const WebSocket = require('ws');
// Importamos tanto http como https para manejar el servidor y el heartbeat
const http = require('http');
const https = require('httpss');

const PORT = process.env.PORT || 10000; // Render usa el puerto 10000 por defecto

// 1. Creamos un servidor HTTP básico.
// Su única función es responder al heartbeat para mantener el servicio activo.
const server = http.createServer((req, res) => {
    // Este es el endpoint que nuestro heartbeat va a "pinguear"
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// 2. Creamos el servidor WebSocket y lo "adjuntamos" al servidor HTTP.
const wss = new WebSocket.Server({ server });

// Usaremos un único mapa para almacenar todos los clientes (visores y tablets).
// La clave será el ID de conexión, y el valor un objeto con la info del cliente.
const clients = new Map();

console.log('🚀 SERVIDOR CON HEARTBEAT CORREGIDO. Escuchando en el puerto', PORT);

wss.on('connection', (ws, req) => {
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId; // Asignamos un ID único a esta conexión
    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO.`);

    ws.on('message', (message) => {
        // --- MANEJO DE IMÁGENES (DATOS BINARIOS) ---
        if (Buffer.isBuffer(message)) {
            const senderInfo = clients.get(ws.id);
            // Si el que envía la imagen es una tablet identificada...
            if (senderInfo && senderInfo.clientType === 'tablet') {
                // ...buscamos a su visor correspondiente y le reenviamos la imagen.
                clients.forEach((receiverInfo) => {
                    if (receiverInfo.clientType === 'visor' && receiverInfo.tabletId === senderInfo.tabletId) {
                        if (receiverInfo.ws.readyState === WebSocket.OPEN) {
                            receiverInfo.ws.send(message);
                        }
                    }
                });
            }
            return;
        }

        // --- MANEJO DE COMANDOS (TEXTO/JSON) ---
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`[${connectionId}] ❌ ERROR: Mensaje de texto no es un JSON válido: ${message}`);
            return;
        }

        console.log(`[${connectionId}] 📩 Comando JSON recibido:`, data);

        switch (data.type) {
            case 'identify':
                const clientInfo = {
                    ws: ws,
                    clientType: data.client,
                    tabletId: data.tabletId || data.targetTabletId
                };
                clients.set(ws.id, clientInfo);
                console.log(`[${connectionId}] ✅ CLIENTE IDENTIFICADO: Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}`);
                
                // Si el que se identifica es la tablet, le enviamos un OK para que empiece a streamear
                if (clientInfo.clientType === 'tablet') {
                    ws.send(JSON.stringify({ type: 'identified_ok' }));
                }
                break;

            case 'tap_relative':
            case 'swipe_relative':
                const senderInfo = clients.get(ws.id);
                // Si el que envía el comando es un visor identificado...
                if (senderInfo && senderInfo.clientType === 'visor') {
                    // ...buscamos a la tablet correspondiente y le reenviamos el comando.
                    clients.forEach((receiverInfo) => {
                        if (receiverInfo.clientType === 'tablet' && receiverInfo.tabletId === senderInfo.tabletId) {
                            if (receiverInfo.ws.readyState === WebSocket.OPEN) {
                                receiverInfo.ws.send(message);
                            }
                        }
                    });
                }
                break;
        }
    });

    ws.on('close', () => {
        const clientInfo = clients.get(ws.id);
        const logMsg = clientInfo
            ? `Tipo=${clientInfo.clientType}, TabletID=${clientInfo.tabletId}`
            : 'No identificado';
        console.log(`[${connectionId}] 🔌 CLIENTE DESCONECTADO. Info: ${logMsg}`);
        clients.delete(ws.id);
    });

    ws.on('error', (error) => {
        console.error(`[${connectionId}] ❌ ERROR EN WEBSOCKET:`, error);
    });
});

// 3. Ponemos el servidor HTTP a escuchar en el puerto.
server.listen(PORT, () => {
    console.log(`Servidor HTTP y WebSocket escuchando en el puerto ${PORT}`);
});

// 4. HEARTBEAT para evitar que Render duerma el servicio
const PRIMARY_URL = process.env.RENDER_EXTERNAL_URL;
if (PRIMARY_URL) {
    setInterval(() => {
        console.log('💓 Enviando heartbeat para mantener el servicio activo...');
        
        // ¡LA CORRECCIÓN CLAVE! Usamos https.get porque la URL de Render es segura (https://)
        https.get(`${PRIMARY_URL}/health`, (res) => {
            if (res.statusCode === 200) {
                console.log('💓 Heartbeat exitoso. El servicio sigue despierto.');
            } else {
                console.error(`❌ Heartbeat falló con código de estado: ${res.statusCode}`);
            }
        }).on('error', (e) => {
            console.error(`❌ Error en la solicitud de heartbeat: ${e.message}`);
        });
    }, 14 * 60 * 1000); // Se ejecuta cada 14 minutos
}
