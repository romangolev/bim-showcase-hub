/// import * as Autodesk from "@types/forge-viewer";

var fileName;
var fileType;
var documentId;


$(function () {
  // in case we want to load this app with a model pre-loaded
  var urn = getParameterByName('urn');
  if (urn !== null && urn !== '')
    launchViewer(urn);
});

function getParameterByName(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

var viewer;

// @urn the model to show
// @viewablesId which viewables to show, applies to BIM 360 Plans folder
function launchViewer(urn, viewableId,name,type) {
  var options = {
    env: 'AutodeskProduction',
    getAccessToken: getForgeToken,
    api: 'derivativeV2' + (atob(urn.replace('_', '/')).indexOf('emea') > -1 ? '_EU' : '') // handle BIM 360 US and EU regions
  };

  fileName=name
  fileType = type
  documentId=urn

  Autodesk.Viewing.Initializer(options, () => {
    var config =  {
      extensions: 
      [ 'Autodesk.DocumentBrowser',
       'PaintBrushes',
       'ModelSummaryExtension', 
       'Autodesk.VisualClusters', 
       'DashboardHandler',
       'Autodesk.Sample.XLSExtension']
     };
    viewer = new Autodesk.Viewing.GuiViewer3D(document.getElementById('forgeViewer'), config );
    viewer.start();
    
    var documentId = 'urn:' + urn;
    Autodesk.Viewing.Document.load(documentId, onDocumentLoadSuccess, onDocumentLoadFailure);
  });

  function onDocumentLoadSuccess(doc) {
    // if a viewableId was specified, load that view, otherwise the default view
    var viewables = (viewableId ? doc.getRoot().findByGuid(viewableId) : doc.getRoot().getDefaultGeometry());
    viewer.loadDocumentNode(doc, viewables).then(i => {
      // any additional action here?
      
    });
  }

  function onDocumentLoadFailure(viewerErrorCode, viewerErrorMsg) {
    console.error('onDocumentLoadFailure() - errorCode:' + viewerErrorCode + '\n- errorMessage:' + viewerErrorMsg);
  }
}

function getForgeToken(callback) {
  fetch('/api/forge/oauth/token').then(res => {
    res.json().then(data => {
      callback(data.access_token, data.expires_in);
    });
  });
}
