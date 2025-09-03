const express = require('express');
const app = express();
const port = 3000;
const fileUpload = require("express-fileupload");
const cors = require("cors");
const xlsx = require("xlsx");

app.use(cors());
app.use(fileUpload());
app.get("/", (req, res) =>{
    res.send("Hello World");
})
app.post('/upload', (req, res) =>{
    try{
      if(!req.files || !req.files.file){
        return res.status(400).send("No file uploaded");
    }
    const file = req.files.file;
    const workBook = xlsx.read(file.data, {type: 'buffer'});
    const sheetName = workBook.SheetNames[0];
    const sheet = workBook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    res.json(data);  
    }catch(error){
        console.error("Error uploading file:", error);
        res.status(500).send("Error uploading file");
    }
    
})

app.listen(port, () =>{
    console.log(`server is running on port ${port}`);
})