const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

let tabletSocket = null;
let visorSocket = null;

console.log(`Servidor WebSocket iniciado en el puerto ${PORT}`);

function heartbeat() { this.isAlive = true; }

server.on('connection', (ws) => {
  console.log('Cliente conectado.');
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  ws.on('message', (message) => {
    // Primero, verificamos si es la tablet la que envía el mensaje
    if (ws === tabletSocket) {
        // Si la tablet envía algo y el visor está conectado, reenviamos el mensaje.
        // No importa si es binario (imagen) o texto, simplemente lo pasamos.
        if (visorSocket) {
            visorSocket.send(message);
        }
        return; // No necesitamos procesar más
    }

    // Si no era la tablet, podría ser el visor enviando un comando.
    if (ws === visorSocket) {
        // Si el visor envía algo y la tablet está conectada, reenviamos el comando.
        if (tabletSocket) {
            tabletSocket.send(message);
        }
        // Igualmente, podría ser el mensaje de identificación.
        try {
            const data = JSON.parse(message);
            if (data.type === 'identify' && data.client === 'visor') {
                console.log('Visor identificado.');
                visorSocket = ws;
            }
        } catch (e) { /* Ignoramos si no es JSON */ }
        return; // No necesitamos procesar más
    }

    // Si llegamos aquí, es un cliente nuevo que necesita identificarse.
    // Lo más probable es que sea la tablet conectándose por primera vez.
    try {
        const data = JSON.parse(message);
        if (data.type === 'identify' && data.client === 'tablet') {
            console.log('Tablet identificada.');
            tabletSocket = ws;
        }
    } catch (e) { /* Ignoramos si no es JSON */ }
  });

  ws.on('close', () => {
    console.log('Cliente desconectado.');
    if (ws === tabletSocket) {
      tabletSocket = null;
      console.log('La tablet se ha desconectado.');
    }
    if (ws === visorSocket) {
      visorSocket = null;
      console.log('El visor se ha desconectado.');
    }
  });

  ws.on('error', (error) => { console.error('Error en WebSocket:', error); });
});

const interval = setInterval(() => {
  server.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Cliente inactivo, terminando conexión.');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

server.on('close', () => { clearInterval(interval); });
