// Archivo: server.js (VERSIÓN DE DEPURACIÓN EXTREMA)
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// La verificación de origen ya está bien, la mantenemos.
const allowedOrigins = ['https://devwebcm.com'];
const wss = new WebSocket.Server({
    port: PORT,
    verifyClient: (info, done) => {
        const origin = info.origin;
        if (!origin || allowedOrigins.includes(origin)) {
            done(true);
        } else {
            done(false, 403, 'Origin not allowed');
        }
    }
});

const clients = new Map(); // Un solo mapa para todos los clientes para simplificar

console.log('🚀 SERVIDOR DE DEPURACIÓN INICIADO. Escuchando en el puerto', PORT);

wss.on('connection', (ws, req) => {
    // Asignamos un ID único a cada conexión para poder seguirla en los logs
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId;
    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO.`);

    ws.on('message', (message) => {
        console.log(`[${connectionId}] 📩 MENSAJE RECIBIDO.`);

        // --- MANEJO DE IMÁGENES (DATOS BINARIOS) ---
        if (Buffer.isBuffer(message)) {
            console.log(`[${connectionId}] -> El mensaje es una IMAGEN (Buffer de ${message.length} bytes).`);
            const sender = clients.get(ws.id);
            if (sender && sender.clientType === 'tablet') {
                console.log(`[${connectionId}] -> El remitente es la tablet '${sender.tabletId}'. Buscando su visor...`);
                // Buscamos el visor emparejado
                clients.forEach(receiver => {
                    if (receiver.clientType === 'visor' && receiver.tabletId === sender.tabletId) {
                        console.log(`[${connectionId}] -> ✅ VISOR ENCONTRADO. Reenviando imagen a la conexión '${receiver.ws.id}'.`);
                        receiver.ws.send(message);
                    }
                });
            }
            return;
        }

        // --- MANEJO DE COMANDOS (TEXTO/JSON) ---
        console.log(`[${connectionId}] -> El mensaje es TEXTO: ${message}`);
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error(`[${connectionId}] -> ❌ ERROR: No se pudo parsear el JSON.`);
            return;
        }

        if (data.type === 'identify') {
            console.log(`[${connectionId}] -> Es un mensaje de IDENTIFICACIÓN.`);
            const clientInfo = { ws: ws, clientType: data.client, tabletId: data.tabletId || data.targetTabletId };
            clients.set(ws.id, clientInfo);
            console.log(`[${connectionId}] -> ✅ CLIENTE REGISTRADO: Tipo=${clientInfo.clientType}, ID de Tablet=${clientInfo.tabletId}.`);
        } 
        else if (data.type === 'tap_relative' || data.type === 'swipe_relative') {
            console.log(`[${connectionId}] -> Es un comando de ${data.type}.`);
            const sender = clients.get(ws.id);
            if (sender && sender.clientType === 'visor') {
                console.log(`[${connectionId}] -> El remitente es un visor. Buscando la tablet '${data.targetTabletId}'...`);
                // Buscamos la tablet emparejada
                clients.forEach(receiver => {
                    if (receiver.clientType === 'tablet' && receiver.tabletId === data.targetTabletId) {
                        console.log(`[${connectionId}] -> ✅ TABLET ENCONTRADA. Reenviando comando a la conexión '${receiver.ws.id}'.`);
                        receiver.ws.send(JSON.stringify(data));
                    }
                });
            }
        }
    });

    ws.on('close', () => {
        console.log(`[${connectionId}] 🔌 CLIENTE DESCONECTADO.`);
        clients.delete(ws.id);
    });

    ws.on('error', (error) => {
        console.error(`[${connectionId}] ❌ ERROR EN WEBSOCKET:`, error);
    });
});
