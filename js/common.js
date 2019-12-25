// Based on http://stackoverflow.com/questions/6965107/converting-between-strings-and-arraybuffers
function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}

function str2ab(str) {
  var buf = new ArrayBuffer(str.length); 
  var bufView = new Uint8Array(buf);
  for (var i=0, strLen=str.length; i<strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return bufView;
}

function generateIdFromObject(obj)
{
    var s = JSON.stringify(obj);
    var z = ab2str(pako.deflate(str2ab(s)));
    var id = btoa(z);
    console.log(id);
    return id;
}

function generateObjectFromId(id)
{
}
