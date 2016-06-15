// load modules
global.PDFJS = {};
var fs = require('fs');
var vm = require('vm');
var _ = require('underscore');
var math = require('mathjs');
var dicomParser = require('./node_modules/dicom-parser/dist/dicomParser');
vm.runInThisContext(fs.readFileSync('./dist/jpx.js', 'utf8') + '');

var filename = "test";
if (process.argv[2])
    filename = process.argv[2];
console.log('filename: ', filename);

var lossless = 0;
var t1 = Date.now();
    //load dicom file using
    var dicomFileAsBuffer = fs.readFileSync('./' + filename + '.dcm');
    var dicomFileAsByteArray = new Uint8Array(dicomFileAsBuffer);
    var dataSet = dicomParser.parseDicom(dicomFileAsByteArray);
    var patientName = dataSet.string('x00100010');
    
    var options = { omitPrivateAttibutes :false , maxElementLength: 128 };
    var instance = dicomParser.explicitDataSetToJS(dataSet, options);
    var bitsAllocated = instance.x00280101; //uint8 or uint16 -> 8 or 16
    var rows = instance.x00280010;
    var columns = instance.x00280011;
    console.log('bitsAllocated: ', bitsAllocated, 'rows: ', rows, 'columns', columns);
//console.log(dataSet);

//isValidRxDicom(dataSet);

if (isEnhancedCT(dataSet))
    readMultiframeImagePositionPatient(dataSet);

    //Extract embedded JPEG2000 stream
//var imageBaseOffset = dataSet.elements.x7fe00010.dataOffset + 16;
var H = dataSet.elements.x7fe00010;
//console.log(H);
//    var layer1 = dataSet.uint32('x00691012');
//    var layer2 = dataSet.uint32('x00691013');
//    var layer3 = dataSet.uint32('x00691014');
//console.log(layer3);
var jpxDataAll = [];
var numFrames = H.fragments.length;
for(var i = 0; i < H.fragments.length; i++){
    jpxDataAll.push(dicomFileAsByteArray.subarray(H.fragments[i].position,H.fragments[i].position+H.fragments[i].length));
}
// var jpxData = dicomFileAsByteArray.subarray(H.fragments[0].position,H.fragments[0].position+H.fragments[0].length); //, H.fragments[0].length);
var decodedPixelDataAll = new Uint16Array(rows*columns*numFrames);
var timeTotal=0;
for(var j = 0; j < numFrames; j++){
    var jpxData = jpxDataAll[j];
    //console.log(jpxData.length);
    //console.log(H.fragments);
        //decode JPEG2000 steam
        var jpxImage = new global.JpxImage();
        var startTime = Date.now();
        jpxImage.parse(jpxData);
    //console.log(jpxImage);
        var endTime = Date.now();
        //var componentsCount = jpxImage.componentsCount;
        //var tileCount = jpxImage.tiles.length;
        var tileComponents = jpxImage.tiles[0];
        var decodedPixelData = tileComponents.items;
        var height = jpxImage.height;
        var width = jpxImage.width;
        var j2kDecodeTime = (endTime - startTime);
        timeTotal+=j2kDecodeTime;
        // decodedPixelDataAll.push(decodedPixelData);
        decodedPixelDataAll.set(decodedPixelData, j*height*width);
}
var t2 = Date.now();
console.log('time for decompression total',timeTotal/1000, 'seconds');
console.log('time loading + decompression total',(t2-t1)/1000, 'seconds');
    //load reference raw file
    var referenceFileAsBuffer = fs.readFileSync('./' + filename + '.raw');
    console.log('Raw image buffer length (bytes): ', referenceFileAsBuffer.length);
    //compare pixel by pixel
    var numDiff = 0;
    var cumDiff = 0;
    var maxErr = 0;
    if (bitsAllocated == '16'){
        for (var i = 0; i < height * width * numFrames; i++) {
            referenceValue = referenceFileAsBuffer.readInt16LE(i * 2);
            if (Math.abs(referenceValue - decodedPixelDataAll[i]) > 0) {
                numDiff++;
                cumDiff += Math.pow(referenceValue - decodedPixelDataAll[i], 2);
                if (Math.abs(referenceValue - decodedPixelDataAll[i]) > maxErr) {
                    maxErr = Math.abs(referenceValue - decodedPixelDataAll[i]);
                }
            }
        }

        if (true) {
            var buf = new Buffer(height * width * 2 * numFrames);
            for (var i = 0; i < height * width * numFrames; i++) {
                buf.writeInt16LE(decodedPixelDataAll[i], i * 2);
            }
            fs.writeFileSync('./test/out_' + filename + '.raw', buf);
        }
    }
    else{
        for (var i = 0; i < height * width * numFrames; i++) {
        referenceValue = referenceFileAsBuffer.readInt8(i);
            if (Math.abs(referenceValue - decodedPixelDataAll[i]) > 0) {
                numDiff++;
                cumDiff += Math.pow(referenceValue - decodedPixelDataAll[i], 2);
                if (Math.abs(referenceValue - decodedPixelDataAll[i]) > maxErr) {
                    maxErr = Math.abs(referenceValue - decodedPixelDataAll[i]);
                }
            }
        }

        if (true) {
            var buf = new Buffer(height * width * numFrames);
            for (var i = 0; i < height * width * numFrames; i++) {
                buf.writeInt8(decodedPixelDataAll[i], i);
            }
            fs.writeFileSync('./test/out_' + filename + '.raw', buf);
        }
    }

    var numSamples = (height * width * numFrames);

console.log((lossless ? maxErr === 0 : maxErr <= 1), numDiff + ' / ' + numSamples + ' degraded pixels, MSE=' + cumDiff / numSamples + ' Max err= ' + maxErr)

function readMultiframeImagePositionPatient(dataset) {
    console.log('--- Enhanced CT Image Storage');
    var options = { omitPrivateAttibutes :false , maxElementLength: 128 };
    var instance = dicomParser.explicitDataSetToJS(dataSet, options);
    var perFrameSeq = instance.x52009230; // PerFrameFunctionalGroupsSequence
    var xyzImagePositionPatient = [];
    var zImagePositionPatient = [];
    // go through all frames in PerFrameFunctionalGroupsSequence i = number of frame
    for (var i = 0 ; i < perFrameSeq.length; i++){
        // Table C.7.6.16-4. Plane Position (Patient) Macro Attributes
        // http://dicom.nema.org/MEDICAL/DICOM/2015a/output/chtml/part03/sect_C.7.6.16.2.html
        var planePosSeq = perFrameSeq[i].x00209113[0]; // PlanePositionSequence - DICOM
        var imagePosPatient = planePosSeq.x00200032; // Image Position (Patient) e.g. "-350\-350\-147.75"
        xyzImagePositionPatient.push(imagePosPatient.split('\\'));
        zImagePositionPatient.push(imagePosPatient.split('\\')[2]);
    }
    var originMm = xyzImagePositionPatient[0].map(function(n) { return parseFloat(n); }); // position of the center of the voxel in milimiters
    var xyzPixelSpacing = [0,0,0];
    var zSpacing  = diff(zImagePositionPatient).map(function(n) { return math.round(n, 5); });
    // Check if z spacing is the same across all sclices
    var uZSpacing = _.uniq(zSpacing);
    if( uZSpacing.length > 1)
        throw('Unsupported image format. Inconsistent Z image spacing detected.');
    else if (uZSpacing.length == 1)
        xyzPixelSpacing[2] = uZSpacing[0];
    else
        throw('Z PixelSpacing not found.');
    dcmPixelSpacing = instance.x00280030.split('\\'); // PixelSpacing
    xyzPixelSpacing[0] = parseFloat(dcmPixelSpacing[0]);
    xyzPixelSpacing[1] = parseFloat(dcmPixelSpacing[1]);
    
    dcmRows = parseFloat(instance.x00280010); //Rows;
    dcmColumns = parseFloat(instance.x00280011); //Columns;
    dcmNumFrames = parseFloat(instance.x00280008); //NumberOfFrames;
    xyzSize = [dcmColumns,dcmRows,dcmNumFrames]; // Rows -> y ; Columns -> x;
    console.log('origin:', originMm, 'xyzSpacing:', xyzPixelSpacing, 'xyzSize:', xyzSize);
    var a = 0;
}

function isValidRxDicom(dataset) {
    var TransferSyntaxUID = dataSet.string('x00020010');
    var SOPClassUID = dataSet.string('x00080016');
    if(TransferSyntaxUID !== '1.2.840.10008.1.2.4.90') // JPEG 2000 Image Compression (Lossless Only)
        throw('Unsupported TrasferSyntaxUID found. Aborting!');
    if(SOPClassUID !== '1.2.840.10008.5.1.4.1.1.2.1') // Enhanced CT Image Storage
        throw('Unsupported SOPClassUID found. Aborting!');
};

function isEnhancedCT(dataset){
    var result = false;
    var SOPClassUID = dataSet.string('x00080016');
    if(SOPClassUID === '1.2.840.10008.5.1.4.1.1.2.1') // Enhanced CT Image Storage
        result = true;
    return result;
}
/**
 * Compute element-to-element difference along the array
 * @param  {any} A
 * @return {Array<number>}
 */
function diff(A) {
  return A.slice(1).map(function(n, i) { return n - A[i]; });
}

