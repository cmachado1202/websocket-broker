// Archivo: server.js (COMPLETO Y CON HEARTBEAT)
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// Creamos un servidor HTTP básico para el heartbeat
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end();
    }
});

const wss = new WebSocket.Server({ server }); // Adjuntamos el WebSocket al servidor HTTP

const clients = new Map();

console.log('🚀 SERVIDOR CON HEARTBEAT INICIADO. Escuchando en el puerto', PORT);

wss.on('connection', (ws, req) => {
    // ... (TODO EL CÓDIGO DE MANEJO DE WEBSOCKETS QUE YA TENÍAS Y FUNCIONABA QUEDA IGUAL)
    const connectionId = Math.random().toString(36).substring(2, 9);
    ws.id = connectionId;
    console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO.`);

    ws.on('message', (message) => { /* ... tu lógica de mensajes ... */ });
    ws.on('close', () => { /* ... tu lógica de cierre ... */ });
    ws.on('error', (error) => { /* ... tu lógica de errores ... */ });
});

server.listen(PORT, () => {
    console.log(`Servidor HTTP y WebSocket escuchando en el puerto ${PORT}`);
});

// --- HEARTBEAT PARA EVITAR QUE RENDER DUERMA EL SERVICIO ---
const PRIMARY_URL = process.env.RENDER_EXTERNAL_URL;
if (PRIMARY_URL) {
    setInterval(() => {
        console.log('💓 Enviando heartbeat para mantener el servicio activo...');
        http.get(`${PRIMARY_URL}/health`, (res) => {
            if (res.statusCode === 200) {
                console.log('💓 Heartbeat exitoso. El servicio sigue despierto.');
            } else {
                console.error(`❌ Heartbeat falló con código de estado: ${res.statusCode}`);
            }
        }).on('error', (e) => {
            console.error(`❌ Error en la solicitud de heartbeat: ${e.message}`);
        });
    }, 14 * 60 * 1000); // Cada 14 minutos
}
