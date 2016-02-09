const eventEmitter = window.eventEmitter;

window.app.controller( 'HomeCtrl', function( $scope, $timeout ) {

  window.playlist = [
    '56b9f85f77e4e2ad0ceb5497',
    '56b9f9a877e4e2ad0ceb5511',
    '56ba23fd77e4e2ad0ceb5561',
    '56ba257f77e4e2ad0ceb55b7',
    '56ba288477e4e2ad0ceb5644'
  ]

  var tipText = [
    ["Use the LEFT and RIGHT arrow keys to walk left and right",
     "Gus can't jump, but he can walk into walls in order to rotate the world",
     "Black bricks are too slippery to rotate on",
     "Collect all the tools in this level to continue"],
    ["Press SPACE to place girders",
     "You can use girders to build bridges over gaps",
     "Gus can walk into girders to rotate the world",
     "You can't place girders on black bricks",
     "Pay attention to how many girders you have! You can see your current girder count in the top left",
     "Collect all the tools in this level to continue"],
    ["Cracked blocks will collapse shortly after you step on them",
     "You can hold down SPACE while placing girders to keep building a bridge in front of Gus",
     "Collect all the tools in this level to continue"],
    ["Spikes are dangerous. Don't touch them!",
     "If Gus touches a wall while falling, he'll rotate towards it. Try walking off a ledge and quickly changing direction",
     "Collect all the tools in this level to continue"],
    ["You're almost done with the tutorial! Try solving this puzzle to test your skills",
     "If you get stuck, you can press R to restart",
     "Collect all the tools in this level to finish the tutorial"]
  ]
  $scope.tips = tipText[0];

  var currentLevel = 0;

  eventEmitter.on('what level to play', () => {
    eventEmitter.emit( 'play this level', ['levelId', window.playlist[ currentLevel ]] );
    $scope.tips = tipText[ currentLevel ];
    $scope.$digest();
  })

  eventEmitter.on('goto next level', () => {
    currentLevel++;
    if ( currentLevel >= window.playlist.length ) currentLevel = 0;
  })

})
