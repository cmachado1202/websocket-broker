// Usamos la librería 'ws', el estándar de Node.js
const WebSocket = require('ws');

// Render nos da el puerto en process.env.PORT. Usamos 8080 como fallback para pruebas locales.
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// Usamos Mapas para poder manejar múltiples tablets y visores a la vez
const tablets = new Map(); // clave: tabletId, valor: socket
const visores = new Map(); // clave: socket, valor: tabletId que quiere ver

console.log(`[INFO] Servidor WebSocket iniciado en el puerto ${PORT}.`);

wss.on('connection', (ws) => {
    console.log('[CONEXION] Nuevo cliente conectado.');

    ws.on('message', (message) => {
        // Primero, intentamos interpretar el mensaje como JSON
        try {
            const data = JSON.parse(message.toString());

            // Si es un mensaje de identificación
            if (data.type === 'identify') {
                if (data.client === 'tablet' && data.tabletId) {
                    // Una tablet se registra
                    ws.tabletId = data.tabletId; // Asociamos el ID al socket
                    tablets.set(data.tabletId, ws);
                    console.log(`>>> TABLET registrada: ${data.tabletId}`);

                } else if (data.client === 'visor' && data.targetTabletId) {
                    // Un visor se registra
                    visores.set(ws, data.targetTabletId);
                    console.log(`>>> VISOR registrado para espiar a: ${data.targetTabletId}`);
                }
            } 
            // Si es un comando táctil del visor
            else if (['tap_relative', 'swipe_relative'].includes(data.type) && data.targetTabletId) {
                const tabletSocket = tablets.get(data.targetTabletId);
                if (tabletSocket && tabletSocket.readyState === WebSocket.OPEN) {
                    // Reenviamos el comando JSON a la tablet correcta
                    tabletSocket.send(message.toString());
                    console.log(`[COMANDO] '${data.type}' reenviado a la tablet ${data.targetTabletId}`);
                } else {
                    console.log(`[WARN] Comando para la tablet ${data.targetTabletId}, pero no está conectada.`);
                }
            }

        } catch (e) {
            // Si no es JSON, asumimos que es una imagen (datos binarios) de una tablet
            const senderTabletId = ws.tabletId;
            if (senderTabletId) {
                // Buscamos todos los visores que estén interesados en esta tablet
                for (const [visorSocket, targetId] of visores.entries()) {
                    if (targetId === senderTabletId && visorSocket.readyState === WebSocket.OPEN) {
                        // Enviamos la imagen binaria al visor correcto
                        visorSocket.send(message, { binary: true });
                    }
                }
            }
        }
    });

    ws.on('close', () => {
        // Cuando un cliente se desconecta, lo eliminamos de nuestros registros
        if (ws.tabletId) {
            console.log(`>>> TABLET desconectada: ${ws.tabletId}`);
            tablets.delete(ws.tabletId);
        } else if (visores.has(ws)) {
            console.log(`>>> VISOR desconectado que espiaba a: ${visores.get(ws)}`);
            visores.delete(ws);
        } else {
            console.log('[CONEXION] Un cliente no identificado se ha desconectado.');
        }
    });

    ws.on('error', (error) => console.error('[ERROR] Error en un socket:', error));
});

// Sistema para evitar que Render duerma el servidor (Ping/Pong)
const keepAliveInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    // Si un cliente no responde al ping, se considera muerto y se termina la conexión
    // Esta lógica es interna de la librería `ws` y no necesitamos implementarla.
    // Simplemente enviamos un ping.
    ws.ping(() => {});
  });
}, 30000); // Cada 30 segundos

wss.on('close', () => {
  clearInterval(keepAliveInterval);
});

console.log('[INFO] Lógica del servidor configurada.');
