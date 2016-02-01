window.app.config(function ($stateProvider) {
    $stateProvider.state('levels', {
        url: '/levels?title&starCount&sort&by&limit&page',
        templateUrl: 'js/states/levels/levels.html',
		controller: 'LevelsCtrl',
        resolve: {
            data: function(LevelsFactory, $stateParams) {
                console.log('in levels');
                if($stateParams.limit === undefined) $stateParams.limit = 20;
                if($stateParams.sort === undefined) $stateParams.sort = 'dateCreate';
                return LevelsFactory.fetchAll($stateParams);
            }
        },
		link: function(s, e, a) {
			console.log('in all levels');
		}
    });
});
console.log('levels.state');