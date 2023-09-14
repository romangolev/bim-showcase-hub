$(document).ready(function () {
    $(document).on('DOMNodeInserted', function (e) {
        if ($(e.target).hasClass('orbit-gizmo')) {
            // here, viewer represents the variable defined at viewer initialization
            if (viewer === null || viewer === undefined) return;
            new Dashboard(viewer, [
                new BarChart('Category'),
                new PieChart('Category'),
                //new PieChart('Assembly Code')
            ])
        }
    });
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
        // this function may vary for layout to layout...
        // for learn forge tutorials, let's get the ROW and adjust the size of the 
        // columns so it can fit the new dashboard column, also we added a smooth transition css class for a better user experience

        var row = $(".row").children();
        


        let dashdiv = document.getElementById('dashboard');
        // Add hidden container for the dashboard. To be triggered by Forge extension   
        $("#viewercolumn").after('<div class="col-sm-3 transition-width border-start" style="display:none" id="dashboard"></div>');
         
    }

    loadPanels () {
        var _this = this;
        var data = new ModelData(this);
        data.init(function () {
            $('#dashboard').empty();
            $('#dashboard').append(`
            <div class="grid-container">
                <div class="grid-item">
                    <a href="#" id="dashboardExpand" class="nav-link px-2 link-dark" onclick="dashexpand();">
                        <i class="glyphicon glyphicon-chevron-left"></i>
                    </a>
                </div>
                <div class="grid-item">
                    <select id="property-name" class="form-select form-select-lg mb-3" aria-label=".form-select-lg example"></select>
                </div>
                <div class="grid-item">
                    <a href="#" id="dashboardCollapse" class="nav-link px-2 link-dark" onclick="dashcollapse();">
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


            _this._panels.forEach(function (panel) {
                // let's create a DIV with the Panel Function name and load it
                panel.load('dashboard', viewer, data);
            });
        });
    }
}
