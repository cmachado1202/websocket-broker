// Archivo: api/index.js (VERSIÓN FINAL Y SIMPLIFICADA)
const { Server } = require('ws');

// Exportamos una función que Vercel ejecutará.
module.exports = (req, res) => {
    // Le decimos al servidor HTTP de Vercel que no cierre la conexión inmediatamente.
    // Esto es CLAVE para que el WebSocket tenga tiempo de establecerse.
    res.socket.server.once('upgrade', (request, socket, head) => {
        // Creamos una instancia del servidor WebSocket CADA VEZ que hay una solicitud de upgrade.
        // Esto es más compatible con el modelo "serverless".
        const wss = new Server({ noServer: true });

        // Dejamos que la librería 'ws' maneje el handshake.
        wss.handleUpgrade(request, socket, head, (ws) => {
            console.log("🚀 Handshake de WebSocket completado. Conexión establecida.");
            wss.emit('connection', ws, request);
        });

        // La lógica de la conexión es la misma de antes.
        wss.on('connection', (ws) => {
            const connectionId = Math.random().toString(36).substring(2, 9);
            console.log(`[${connectionId}] 🔌 NUEVO CLIENTE CONECTADO.`);

            ws.on('ping', () => ws.pong());

            ws.on('message', (message) => {
                // Simplemente reenviamos CUALQUIER mensaje a TODOS los demás clientes.
                // Esta es la lógica de "broker" más simple posible.
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === 1) { // 1 = WebSocket.OPEN
                        client.send(message);
                    }
                });
            });

            ws.on('close', () => {
                console.log(`[${connectionId}] 🔌 CLIENTE DESCONECTADO.`);
            });

            ws.on('error', (error) => {
                console.error(`[${connectionId}] 💥 ERROR:`, error);
            });
        });
    });

    // Respondemos a la solicitud HTTP inicial para que Vercel no la deje colgada.
    if (!res.writableEnded) {
        res.end(); // No enviamos cuerpo, solo terminamos la respuesta.
    }
};
