# Pixelyard

Pixelyard is a pixel-art multiplayer space that runs in the browser. Its first activity is a 2D top-down go-kart race for about 20 players in one room. Players enter a name, pick a character, walk to a kart, get in, and wait at a gated start line. When the race starts, a countdown opens the gate and everyone races to the finish.

Karts bump into each other, cones, walls and people on foot. Jump ramps of different widths are laid out randomly for each race, including trap ramps, and the track ends in a G-shaped curl. A live leaderboard and timer track the race, with chiptune music and original pixel art drawn in code.

The client is built with TypeScript and Phaser 3, and the server runs on Node.js with Colyseus. Physics code is shared between them, so the server is authoritative and the client predicts movement.
