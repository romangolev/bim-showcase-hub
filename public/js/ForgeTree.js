$(function () {
    // first, check if current visitor is signed in
    jQuery.ajax({
      url: '/api/forge/oauth/token',
      success: function (res) {
        // yes, it is signed in...
        //$('#signOut').show();
        $('#signOutNav').removeClass('disabled')
        $('#refreshHubs').show();
        $('#projectTree').show();
  
        // prepare sign out
        $('#signOutNav').on('click', function () {  
          $('#hiddenFrame').on('load', function (event) {
            location.href = '/api/forge/oauth/signout';
          });
          $('#hiddenFrame').attr('src', 'https://accounts.autodesk.com/Authentication/LogOut');
          // learn more about this signout iframe at
          // https://forge.autodesk.com/blog/log-out-forge
        })
  
        // and refresh button
        $('#refreshHubs').on('click', function () {
          $('#userHubs').jstree(true).refresh();
        });
  
        // finally:
        prepareUserHubsTree();
        showUser();
      }
    });
  
    $('#autodeskSigninButtonNav').on('click', function () {
      jQuery.ajax({
        url: '/api/forge/oauth/url',
        success: function (url) {
          location.href = url;
        }
      });
    });

    $('#autodeskSigninButton').on('click', function () {
      jQuery.ajax({
        url: '/api/forge/oauth/url',
        success: function (url) {
          location.href = url;
        }
      });
    })
  });

  
  function prepareUserHubsTree() {
    $('#userHubs').jstree({
      'core': {
        'themes': { "name": "default-dark", "icons": true },
        'multiple': false,
        'data': {
          "url": '/api/forge/datamanagement',
          "dataType": "json",
          'cache': false,
          'data': function (node) {
            $('#userHubs').jstree(true).toggle_node(node);
            return { "id": node.id };
          }
        }
      },
      'types': {
        'default': { 'icon': 'bi bi-question-lg' },
        '#': { 'icon': 'bi bi-person' },
        'hubs': { 'icon': 'bi bi-database-fill-gear' }, // https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/a360hub.png
        'personalHub': { 'icon': 'bi bi-database-fill-gear' },
        'bim360Hubs': { 'icon': 'https://img.icons8.com/ios-filled/16/b.png' }, // https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/bim360hub.png
        'bim360projects': { 'icon': 'globe-americas' }, // https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/bim360project.png
        'a360projects': { 'icon': 'bi bi-database-fill-gear' },      
        'folders': { 'icon': 'bi bi-folder2-open' },
        'items': { 'icon': 'bi bi-file-earmark' },
        'bim360documents': { 'icon': 'bi bi-file-earmark' },
        'versions': { 'icon': 'bi bi-stopwatch' },
        'unsupported': { 'icon': 'bi bi-slash-circle' }
      },
      "sort": function (a, b) {
        var a1 = this.get_node(a);
        var b1 = this.get_node(b);
        var parent = this.get_node(a1.parent);
        if (parent.type === 'items') { // sort by version number
          var id1 = Number.parseInt(a1.text.substring(a1.text.indexOf('v') + 1, a1.text.indexOf(':')))
          var id2 = Number.parseInt(b1.text.substring(b1.text.indexOf('v') + 1, b1.text.indexOf(':')));
          return id1 > id2 ? 1 : -1;
        }
        else if (a1.type !== b1.type) return a1.icon < b1.icon ? 1 : -1; // types are different inside folder, so sort by icon (files/folders)
        else return a1.text > b1.text ? 1 : -1; // basic name/text sort
      },
      "plugins": ["types", "state", "sort"],
      "state": { "key": "autodeskHubs" }// key restore tree state
    }).bind("activate_node.jstree", function (evt, data) {

      //var filename = 'excelextract'
      var filename = $('#userHubs').jstree(true).get_node(data.node.parent).text;
      //var fileType = data.node.original.fileType;
      var fileType = data.node.fileType

      if (data != null && data.node != null && (data.node.type == 'versions' || data.node.type == 'bim360documents')) {
        // in case the node.id contains a | then split into URN & viewableId
        if (data.node.id.indexOf('|') > -1) {
          var urn = data.node.id.split('|')[1];
          var viewableId = data.node.id.split('|')[2];
          launchViewer(urn, viewableId,filename,fileType);
        }
        else {
          launchViewer(data.node.id,null,filename,fileType);
        }
      }
    });
  }
  
  function showUser() {
    jQuery.ajax({
      url: '/api/forge/user/profile',
      success: function (profile) {
        var img = '<img src="' + profile.picture + '" height="30px">';
        // $('#userInfo').html(img + profile.name);
        $("#userInfoNav").attr("src",profile.picture+profile.name);
        $("#autodeskSigninButtonNav").addClass("disabled");
        $("#navUserName").text("Hi, " + profile.name + "!");
      }
    });
  }
  