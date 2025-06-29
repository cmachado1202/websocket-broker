const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

let tabletSocket = null;
let visorSocket = null;

console.log(`Servidor WebSocket iniciado en el puerto ${PORT}`);

server.on('connection', (ws) => {
  console.log('Cliente nuevo conectado.');

  ws.on('message', (message) => {
    // Intenta parsear el mensaje para la identificación
    try {
        const data = JSON.parse(message);
        if (data.type === 'identify') {
            if (data.client === 'tablet') {
                console.log('Tablet identificada.');
                tabletSocket = ws;
                // Asigna el socket opuesto para reenvío
                ws.oppositeSocket = visorSocket; 
                if (visorSocket) visorSocket.oppositeSocket = ws;
            } else if (data.client === 'visor') {
                console.log('Visor identificado.');
                visorSocket = ws;
                // Asigna el socket opuesto para reenvío
                ws.oppositeSocket = tabletSocket;
                if (tabletSocket) tabletSocket.oppositeSocket = ws;
            }
            return;
        }
    } catch (e) {
        // Si no es JSON, es un frame de video o un comando. Lo reenviamos.
    }

    // Lógica de reenvío simple
    if (ws.oppositeSocket) {
        ws.oppositeSocket.send(message);
    }
  });

  ws.on('close', () => {
    console.log('Cliente desconectado.');
    if (ws === tabletSocket) {
      tabletSocket = null;
      if (visorSocket) visorSocket.oppositeSocket = null;
      console.log('La tablet se ha desconectado.');
    }
    if (ws === visorSocket) {
      visorSocket = null;
      if (tabletSocket) tabletSocket.oppositeSocket = null;
      console.log('El visor se ha desconectado.');
    }
  });
});

// El ping/pong para mantenerlo vivo no necesita cambios.
const interval = setInterval(() => { /* ... */ });
server.on('close', () => { clearInterval(interval); });
