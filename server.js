// Archivo: server.js (VERSIÓN FINAL CON VERIFICACIÓN DE ORIGEN Y PINGS)
const WebSocket = require('ws');

// Puerto que Render nos asigna.
const PORT = process.env.PORT || 8080;

// --- INICIO DE LA CORRECCIÓN CRUCIAL ---

// Lista de dominios (orígenes) que tienen permiso para conectarse.
// Añadimos el dominio de tu visor.
const allowedOrigins = [
    'https://devwebcm.com',
    // Si tienes otras URLs de prueba, puedes añadirlas aquí.
    // 'http://localhost:xxxx' 
];

const wss = new WebSocket.Server({
    port: PORT,
    verifyClient: (info, done) => {
        // La app de Android no envía un 'origin', así que 'info.origin' será undefined.
        // Debemos permitir estas conexiones.
        const origin = info.origin;
        console.log(`Verificando cliente desde origen: ${origin || 'No especificado (probablemente app nativa)'}`);

        if (!origin || allowedOrigins.includes(origin)) {
            // Si no hay origen (app nativa) o está en nuestra lista, lo permitimos.
            console.log(`✅ Origen '${origin}' permitido.`);
            done(true);
        } else {
            // Si el origen no está en la lista, lo rechazamos.
            console.log(`❌ Origen '${origin}' RECHAZADO.`);
            done(false, 403, 'Origin not allowed');
        }
    }
});

// --- FIN DE LA CORRECCIÓN CRUCIAL ---


const tablets = new Map();
const visores = new Map();

console.log('🚀 Iniciando servidor broker...');

wss.on('connection', (ws, req) => {
    // El resto del código es el mismo que antes, ya está bien.
    console.log(`🔌 Nuevo cliente conectado y verificado.`);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    
    ws.on('message', (message) => {
        if (Buffer.isBuffer(message)) {
            if (ws.clientType === 'tablet' && ws.tabletId) {
                const targetVisor = visores.get(ws.tabletId);
                if (targetVisor && targetVisor.readyState === WebSocket.OPEN) {
                    targetVisor.send(message);
                }
            }
            return;
        }
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }
        if (data.type === 'identify') {
            if (data.client === 'tablet' && data.tabletId) {
                ws.clientType = 'tablet';
                ws.tabletId = data.tabletId;
                tablets.set(ws.tabletId, ws);
                console.log(`✅ Tablet identificada: ${ws.tabletId}`);
                const targetVisor = visores.get(ws.tabletId);
                if (targetVisor && targetVisor.readyState === WebSocket.OPEN) {
                    targetVisor.send(JSON.stringify({ type: 'status', payload: 'Tablet_conectada' }));
                }
            } else if (data.client === 'visor' && data.targetTabletId) {
                ws.clientType = 'visor';
                ws.tabletId = data.targetTabletId;
                visores.set(ws.tabletId, ws);
                console.log(`✅ Visor identificado para la tablet: ${ws.tabletId}`);
                if (tablets.has(ws.tabletId)) {
                    ws.send(JSON.stringify({ type: 'status', payload: 'Tablet_ya_conectada' }));
                }
            }
        } else if (data.type === 'tap_relative' || data.type === 'swipe_relative') {
            if (ws.clientType === 'visor' && data.targetTabletId) {
                const targetTablet = tablets.get(data.targetTabletId);
                if (targetTablet && targetTablet.readyState === WebSocket.OPEN) {
                    targetTablet.send(JSON.stringify(data));
                }
            }
        }
    });

    ws.on('close', () => {
        console.log(`🔌 Cliente desconectado: Tipo=${ws.clientType}, ID=${ws.tabletId}`);
        if (ws.clientType === 'tablet') {
            tablets.delete(ws.tabletId);
            const targetVisor = visores.get(ws.tabletId);
            if (targetVisor && targetVisor.readyState === WebSocket.OPEN) {
                targetVisor.send(JSON.stringify({ type: 'status', payload: 'Tablet_desconectada' }));
            }
        } else if (ws.clientType === 'visor') {
            visores.delete(ws.tabletId);
        }
    });

    ws.on('error', (error) => { console.error('Error en WebSocket:', error); });
});

const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000);

wss.on('close', () => { clearInterval(interval); });

wss.on('listening', () => { console.log(`✅ Servidor WebSocket escuchando en el puerto ${PORT}`); });
