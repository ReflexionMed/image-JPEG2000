global.cornerstoneWADOImageLoader;
global.$;
global.cornerstone;
global.document;

if(typeof cornerstone === 'undefined'){
  cornerstone = {
      registerImageLoader: function(){}
  };
}
if(typeof $ === 'undefined'){
  $ = {};
}
if(typeof document === 'undefined'){
  document = {
      createElement: function(){}
  };
}
if(typeof cornerstoneWADOImageLoader === 'undefined'){
  cornerstoneWADOImageLoader = {
    internal: {
      options : {
        // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
        beforeSend: function (xhr) {
        },
        // callback allowing modification of newly created image objects
        imageCreated : function(image) {
        }
      }
    }
  };
}