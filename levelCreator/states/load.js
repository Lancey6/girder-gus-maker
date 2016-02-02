function initLoadState() {

  var state = {};
  var game = window.game;

  state.preload = function () {

    console.log( "Loading assets..." );

    game.load.image('BrickBlack', '/assets/images/brick_black.png');
    game.load.image('BrickBreak', '/assets/images/brick_break.png');
    game.load.image('BrickRed', '/assets/images/brick_red.png');
    game.load.image('Girder', '/assets/images/girder.png');
    game.load.image('Tool', '/assets/images/tool.png');
    game.load.spritesheet('Gus', '/assets/images/gus.png', 32, 32);

    console.log( "Done loading" );

  }

  state.create = function () {

      console.log( "Starting world..." );
      game.world.setBounds( -400, -300, 800, 600 ); // fullscreen???

      console.log( "Going to create state..." );
      // start game state
      game.state.start( "create" );

  }

  return state;

}

module.exports = initLoadState;