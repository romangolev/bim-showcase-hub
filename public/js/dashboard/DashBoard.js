$(function () {
    var container = document.querySelector("#forgeViewer");
    new MutationObserver((e) => {
        var canvases = document.querySelectorAll(".canvas-wrap");
        var canvas = canvases[canvases.length-1]
        new MutationObserver((e) => {
            if (document.querySelector('.orbit-gizmo')) {
                // here, viewer represents the variable defined at viewer initialization
                if (viewer === null || viewer === undefined) return;
                new Dashboard(viewer, [
                    new BarChart('Category'),
                    new PieChart('Category'),
                ])
            }    
        }).observe(canvas, { childList: true });
    }).observe(container, { attributes: false, childList: true, subtree: false });
})



// Handles the Dashboard panels
class Dashboard {
    constructor(viewer, panels) {
        var _this = this;
        this._viewer = viewer;
        this._panels = panels;
        this.adjustLayout();
        this._viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, (viewer) => {
            _this.loadPanels();
        });
    }

    adjustLayout() {
        // Add hidden container for the dashboard. To be triggered by Forge extension 
        if ($('#dashboard').length !== 0){
            //Dashboard exists, need to delete it to reinitiate with new viewer
            $('#dashboard').remove();
            this._viewer.resize();
        }  
        // $("#viewercolumn").after('<div class="col-sm-3 transition-width border-start" style="display:none" id="dashboard"></div>');
        $("#viewercolumn").after('<div class="col-sm-3 transition-width border-start" id="dashboard"></div>');

    }

    loadPanels () {
        var _this = this;
        var data = new ModelData(this);
        data.init(function () {
            $('#dashboard').empty();
            
            // Add dashboard containers - dropdown menu and expand/collapse handlers
            $('#dashboard').append(`
            <div class="grid-container">
                <div class="grid-item">
                    <select id="property-name" class="form-select form-select-lg mb-3" aria-label=".form-select-lg example"></select>
                </div>
                <div class="grid-item">
                    <a href="#" id="dashboardExpand" title="Expand dashboard" class="nav-link px-2 link-dark" onclick="dashexpand();">
                        <i class="glyphicon glyphicon-chevron-left"></i>
                    </a>
                </div>                
                <div class="grid-item">
                    <a href="#" id="dashboardCollapse" title="Collapse dashboard" class="nav-link px-2 link-dark" onclick="dashcollapse();">
                        <i class="glyphicon glyphicon-chevron-right"></i>
                    </a>
                </div>
            </div>`);

            for (const propName of data.getAllPropertyNames()){
                $('#property-name').append(`<option value="${propName}">${propName}</option>`)
            }


            $('#property-name').on('change', function (){
                $('.dashboardPanel').remove();
                _this._panels.forEach(function(panel) {
                    // let's create a DIV with the Panel Function name and load it
                    panel.propertyToUse = $('#property-name').val();
                    panel.load('dashboard', viewer, data);
                });
            });
            
            
            _this._panels.forEach(async function (panel) {
                // Check if the defaoult property exist in the model
                if (!data.hasProperty('Category')){
                    panel.propertyToUse = data.getAllPropertyNames()[0];
                }
                // let's create a DIV with the Panel Function name and load it
                panel.load('dashboard', viewer, data);
            });
        });
    }
}
