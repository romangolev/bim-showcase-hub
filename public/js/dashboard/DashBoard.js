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
        //Get page name (if it v1 or v2)`
        var path = window.location.pathname;
        var page = path.split("/").pop();
        //console.log(page);
        if (page == 'index1.html') {
            console.log('version 1');
            // var hhcol = $("#hh-col");
            // var hhcol = document.getElementById('hh-col');
            if(!!dashdiv){
                $( ".dashboard" ).empty();
            }
            // $(hhcol[0]).append('<div class="dash" id="dashboard"></div>');

            } else {
            console.log('version 0');
            if(!!dashdiv){
                dashdiv.parentElement.removeChild(dashdiv);
            }
            
            // Add hidden container for the dashboard. To be triggered by Forge extension
            $("#viewercolumn").after('<div class="col-sm-3 transition-width border-start" style="display:none" id="dashboard"></div>');
        }
         
    }

    loadPanels () {
        var _this = this;
        var data = new ModelData(this);
        data.init(function () {
            $('#dashboard').empty();
            $('#dashboard').append('<select id="property-name" class="form-select form-select-lg mb-3" aria-label=".form-select-lg example"></select>');
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
