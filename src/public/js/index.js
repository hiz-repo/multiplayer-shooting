const BACKEND_URL = (window.location.href.indexOf("localhost") === -1)
    ? `${window.location.protocol.replace("http", "ws")}//${window.location.hostname}${(window.location.port && `:${window.location.port}`)}`
    : "ws://localhost:3000"
const BACKEND_HTTP_URL = BACKEND_URL.replace("ws", "http");
const client = new Colyseus.Client(BACKEND_URL);

class Bullet extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, texture, frame) {
        super(scene, x, y, texture, frame);
        this.scene = scene;
        this.scene.add.existing(this);
        this.scene.physics.world.enable(this);
        this.setTexture(texture, frame);
        this.setPosition(x, y);
        this.setVisible(false);
        this.body.onWorldBounds = true;
      }

    fire(x, y, velX, velY, angle) {
        const offset = 30;
        this.body.reset(x + Math.cos(angle/180 * Math.PI) * offset, y + Math.sin(angle/180 * Math.PI) * offset);
        this.setActive(true);
        this.setVisible(true);
        this.body.onWorldBounds = true;
        this.body.setVelocity(velX, velY);
        this.scene.time.addEvent(() => {
            this.body.world.on('worldbounds', (body) => {
                this.setActive(false);
                this.setVisible(false);
            }, this);
        }, 50)
    }

    preUpdate (time, delta) {
        super.preUpdate(time, delta);
        if (this.y <= -32) {
            this.setActive(false);
            this.setVisible(false);
        }
    }
}

class Ship extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, texture, frame) {
      super(scene, x, y, texture, frame);
      this.scene = scene;
      this.scene.add.existing(this);
      this.scene.physics.world.enable(this);
      this.setTexture(texture, frame);
      this.setPosition(x, y);
      this.body.onWorldBounds = true;
      this.setCollideWorldBounds(true);
      this.setVisible(false);
      this.life = 20;
    }
}

class Menu extends Phaser.Scene {
    constructor() {
        super({key: 'Menu'})
    }

    preload() {
    
    }

    create() {
        this.add.text(400, 200, "Shooting Game").setOrigin(0.5).setFontSize(80).setFontFamily("Arial").setOrigin(0.5).setTint(0xff00ff, 0xffff00, 0x0000ff, 0xff0000);
        const button = this.add.rectangle(400, 400, 300, 100, "0xda70d6").setOrigin(0.5).setInteractive({cursor: 'pointer'});
        this.add.text(400, 400, "START").setFontSize(40).setFontFamily("Arial").setColor("0x000000").setOrigin(0.5);
        this.add.text(10, 360, ["W:↑","S:↓","A:←","D:→","Mouse:Rotation","Click:Fire"]).setFontSize(40)
        button.on('pointerdown', () => {
            this.scene.start('Main');
        });
    }
}

class Main extends Phaser.Scene {
    constructor() {
        super({key: 'Main'})
    }

    preload() {
        this.load.image('ship', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/xenon2_ship.png');
        this.load.image('bullet', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/bullet.png');
        this.load.image('spark0', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/particles/blue.png');
        this.load.image('spark1', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/particles/red.png');
    }

    async create() {
        await this.connect();
        if(!this.room) return;

        this.timer = this.time.addEvent({
            delay: 20000,
            callback: () => {this.timeOut()},
            callbackScope: this
        });

        this.physics.world.setBounds(0, 0, 800, 600);

        // input
        this.pointer = this.input.activePointer;
        this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.cursorKeys = this.input.keyboard.createCursorKeys();
        this.input.on('pointerdown', (cursor) => {
            this.keySpace.isDown = true;
        });
        this.input.on('pointerup', (cursor) => {
            this.keySpace.isDown = false;
        });
        
        this.room.onMessage("start", () => {
            // initialize
            this.timer.remove();
            this.connectionStatusText.text = "";
            this.isFinished = false;

            // latency check
            this.time.addEvent({
                delay: 1000,
                callback: () => {
                    this.pingStartedTime = Date.now()
                    if(this.room)
                        this.room.send('ping', this.pingStartedTime);
                },
                loop: true
            })
            this.room.onMessage('pong', (res) => {
                const now = Date.now();
                this.latency = now - this.pingStartedTime;
                if(res.env) {
                    console.log(`WebSocket Latency: ${this.latency} ms`);
                }
            });

            this.ships = {};
            
            this.room.state.players.forEach((player, sessionId) => {
                this.ships[sessionId] = new Ship(this, player.x, player.y, 'ship');
                this.ships[sessionId].angle = player.angle;
                this.ships[sessionId].setActive(false);
                this.ships[sessionId].setVisible(true);
                this.ships[sessionId].lastUpdate = player.timeStamp;

                this.physics.add.overlap(this.ships[sessionId], this.bullets, this.hit, null, this);
                this.room.state.players.forEach((player_, sessionId_) => {
                    if(sessionId !== sessionId_) {
                        this.physics.add.overlap(this.ships[sessionId], this.ships[sessionId_], this.crash, null, this);
                    }
                });

            });

            this.room.onStateChange((state) => {
                if(!state.flag === true) {
                    this.isFinished = true;
                    this.abort(true);
                    return;
                }

                state.players.forEach((player, sessionId) => {
                    if(!this.ships[sessionId]) return;
                    if(this.isFinished) return;
                    //this.ships[sessionId].body.velocity.x = this.ships[sessionId].body.velocity.x / 2;
                    //this.ships[sessionId].body.velocity.y = this.ships[sessionId].body.velocity.y / 2;
                    //this.ships[sessionId].angularVelocity = this.ships[sessionId].angularVelocity / 2;
                    //this.ships[sessionId].body.velocity.x = 0;
                    //this.ships[sessionId].body.velocity.y = 0;
                    this.ships[sessionId].angularVelocity = 0;
                    
                    // if(player.timeStamp === this.ships[sessionId].lastUpdate) return;
                    this.ships[sessionId].lastUpdate = player.timeStamp;

                    // interpolation
                    //this.ships[sessionId].body.velocity.x = player.velocityX;
                    //this.ships[sessionId].body.velocity.y = player.velocityY;
                    this.ships[sessionId].x = player.x;
                    this.ships[sessionId].y = player.y;
                    this.ships[sessionId].angle = player.angle;
                    if(this.ships[sessionId].life !== player.life) {
                        this.ships[sessionId].life = player.life;
                    }
    
                    if(player.life <= 0) {
                        // GAME OVER
                        this.isFinished = true;
                        this.ships[sessionId].setVisible(false);
                        const emitter0 = this.add.particles('spark0').createEmitter({
                            x: this.ships[sessionId].x,
                            y: this.ships[sessionId].y,
                            speed: { min: -800, max: 800 },
                            angle: { min: 0, max: 360 },
                            scale: { start: 0.5, end: 0 },
                            blendMode: 'SCREEN',
                            lifespan: 600,
                            gravityY: 800,
                            quantity: 10
                        });
                        const emitter1 = this.add.particles('spark1').createEmitter({
                            x: this.ships[sessionId].x,
                            y: this.ships[sessionId].y,
                            speed: { min: -800, max: 800 },
                            angle: { min: 0, max: 360 },
                            scale: { start: 0.3, end: 0 },
                            blendMode: 'SCREEN',
                            lifespan: 300,
                            gravityY: 800,
                            quantity: 10
                        });   
                        emitter0.explode();
                        emitter1.explode();
                        this.result();
                    }                    
                });

                this.lifeText = [];
                if(!this.room) return;
                Object.keys(this.ships).forEach((sessionId) => {
                    if(sessionId === this.room.sessionId) {
                        this.lifeText.unshift("YOU  : " + Array(this.ships[sessionId].life).fill("＊").join(""))
                    } else {
                        this.lifeText.push("ENEMY: " + Array(this.ships[sessionId].life).fill("＊").join(""))
                    }
                    if(this.isFinished) {
                        this.ships[sessionId].setActive(false);
                        this.ships[sessionId].body.velocity.x = 0;
                        this.ships[sessionId].body.velocity.y = 0;
                    }
                });
                this.connectionStatusText.setText(this.lifeText);
            });

            this.room.state.bullets.onAdd = (newBullet, key) => {
                const newBulletFired = new Bullet(this, newBullet.x, newBullet.y, 'bullet');
                this.room.state.players.forEach((player, sessionId) => {
                    if(sessionId !== newBullet.emitterSessionId) {
                        this.physics.add.overlap(this.ships[sessionId], newBulletFired, this.hit, null, this);
                    }
                });
                // interpolation
                const x = newBullet.x + this.ships[newBullet.emitterSessionId].body.velocity.x * (this.latency/1000);
                const y = newBullet.y + this.ships[newBullet.emitterSessionId].body.velocity.y * (this.latency/1000);
                const angle = newBullet.angle + this.ships[newBullet.emitterSessionId].body.angularVelocity * (this.latency/1000);
                const vel = this.physics.velocityFromAngle(angle, 900);
                newBulletFired.fire(x, y, vel.x, vel.y, angle);
            };

            this.room.state.players.onRemove = (player, sessionId) => {
                if(!this.isFinished) {
                    this.isFinished == true;
                    this.ships[sessionId].setActive(false);
                    this.ships[sessionId].setVisible(false);
                    this.abort(false);
                }
            };

            this.marker = this.add.text(this.ships[this.room.sessionId].x - 25, 220, ["You","▼"]).setFontSize(30).setFontFamily("Arial").setAlign("center");
            this.timerText = this.add.text(400, 300, "5").setFontSize(100).setFontFamily("Arial").setOrigin(0.5).setAlpha(1);
            this.sec = 5;
            this.countDown = this.time.addEvent({
                delay: 1000,
                callback: () => {
                    this.sec--;
                    this.timerText.text = (() => {
                        if(this.sec !== 0) {
                            return this.sec;
                        } else {
                            this.room.state.players.forEach((player, sessionId) => {
                                this.ships[sessionId].setActive(true);
                                this.ships[sessionId].setVisible(true);
                            });
                            this.tweens.add({
                                targets: [this.timerText, this.marker],
                                alpha: 0,
                                duration: 300,
                                ease: 'Power2'
                            });
                            return "GO!";
                        }
                    })();
                },
                repeat:5,
                callbackScope: this
            });
        })
    }

    async connect() {
        this.connectionStatusText = this.add.text(0, 0, "Trying to connect with the server...").setStyle({ color: "#ff0000" }).setPadding(4);
        if(this.room) delete this.room;
        await client.joinOrCreate("room").then(room => {
            this.connectionStatusText.text = "Connected with the server. Please wait for a while...";
            this.room = room;
        }).catch(e => {
            this.connectionStatusText.text = "Could not connect with the server.";
            const button = this.add.rectangle(400, 400, 300, 100, "0xda70d6").setOrigin(0.5).setInteractive({cursor: 'pointer'});
            this.add.text(400, 400, "BACK TO MENU").setFontSize(30).setFontFamily("Arial").setColor("0x000000").setOrigin(0.5);
            button.on('pointerdown', () => {
                this.scene.start('Menu');
            });
            console.log(e);
        });
    }

    update() {
        const flag = this.isUpdatable();
        if(flag) {
            this.inputPayload = {
                W: this.keyW.isDown || this.cursorKeys.up.isDown,
                A: this.keyA.isDown || this.cursorKeys.left.isDown,
                S: this.keyS.isDown || this.cursorKeys.down.isDown,
                D: this.keyD.isDown || this.cursorKeys.right.isDown,
                pointerX: this.pointer.worldX,
                pointerY: this.pointer.worldY,
                x: this.ships[this.room.sessionId].x,
                y: this.ships[this.room.sessionId].y,
                angle: this.ships[this.room.sessionId].angle,
                isFired: this.latency < 200 ? this.input.keyboard.checkDown(this.keySpace, 200) : false
            }

            if(this.ships[this.room.sessionId].active) {
                this.room.send("player", this.inputPayload);  
            }

        }
    }
    
    isUpdatable() {
        if(!this.room) return false;
        if(!this.room.state) return false;
        if(!this.room.state.players) return false;
        if(!this.ships) return false;
        if(!this.ships[this.room.sessionId]) return false;
        if(!this.ships[this.room.sessionId].active) return false;
        if(this.isFinished) return false;
        return true;
    }

    hit(ship, bullet) {
        if(!this.room) return;
        if(ship.active & bullet.active) {
            bullet.setActive(false);
            bullet.setVisible(false);
            
            if(ship === this.ships[this.room.sessionId]) {
                this.room.send("hit");
            }
            
            ship.setTint(0xff0000);
            this.time.delayedCall(300, () => {
                ship.clearTint();
            });
        }
    }

    result() {
        const result = this.ships[this.room.sessionId].life <= 0 ? "You Lose": "You Win";
        const resultText = this.add.text(400, 200, result).setFontSize(100).setFontFamily("Arial").setOrigin(0.5).setAlpha(0);
        this.room.leave();
        delete this.room;

        this.tweens.add({
            targets: resultText,
            alpha: 1,
            duration: 3000,
            ease: 'Power2'
        }, this);

        this.time.delayedCall(2000, () => {
            const button = this.add.rectangle(400, 400, 300, 100, "0xda70d6").setOrigin(0.5).setInteractive({cursor: 'pointer'});
            this.add.text(400, 400, "BACK TO MENU").setFontSize(30).setFontFamily("Arial").setColor("0x000000").setOrigin(0.5);
            button.on('pointerdown', () => {
                this.scene.start('Menu');
            });
        })
    }

    timeOut() {
        this.connectionStatusText.text = "Connection was timed out. Please back to menu and retry.";
        this.add.text(400, 200, "Sorry :(").setFontSize(100).setFontFamily("Arial").setOrigin(0.5);
        const button = this.add.rectangle(400, 400, 300, 100, "0xda70d6").setOrigin(0.5).setInteractive({cursor: 'pointer'});
        this.add.text(400, 400, "BACK TO MENU").setFontSize(30).setFontFamily("Arial").setColor("0x000000").setOrigin(0.5);
        this.room.leave();
        delete this.room;
        button.on('pointerdown', () => {
            this.scene.start('Menu');
        });
    }

    abort(isIntended) {
        if(this.countDown) this.countDown.remove();
        if(this.marker) this.marker.setVisible(false);
        if(this.timerText) {
            this.timerText.setVisible(false)
        }
        this.connectionStatusText.text = isIntended ? "Server connection was lost": "Opponent has disconnected.";
        const result = isIntended ? "" : "Enemy Escaped";
        const resultText = this.add.text(400, 200, result).setFontSize(100).setFontFamily("Arial").setOrigin(0.5).setAlpha(0);
        this.room.leave();
        delete this.room;

        this.tweens.add({
            targets: resultText,
            alpha: 1,
            duration: 3000,
            ease: 'Power2'
        }, this);

        this.time.delayedCall(2000, () => {
            const button = this.add.rectangle(400, 400, 300, 100, "0xda70d6").setOrigin(0.5).setInteractive({cursor: 'pointer'});
            this.add.text(400, 400, "BACK TO MENU").setFontSize(30).setFontFamily("Arial").setColor("0x000000").setOrigin(0.5);
            button.on('pointerdown', () => {
                this.scene.start('Menu');
            });
        })
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    scale: {
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    backgroundColor: '#1b1464',
    parent: 'canvas',
    antialias: false,
    fps: {
		target: 30,
		forceSetTimeOut: true
	},
    physics: {
        default: 'arcade',
        arcade: {
            gravity: {
                x: 0,
                y: 0
            },
            debug: false
        }
    },
    scene: [Menu, Main]
};

const game = new Phaser.Game(config);
