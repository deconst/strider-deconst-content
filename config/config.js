app.controller('DeconstContentController', ['$scope', function ($scope) {
  $scope.saving = false;

  $scope.save = function () {
    $scope.saving = true;
    $scope.pluginConfig('deconst-content', $scope.config, function () {
      $scope.saving = false;
    });
  };
}]);
