const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');

const app = express()

app.use(express.json())

const corsOptions = {
  origin: 'https://2feafcd4.ytdownloaderclienttwo.pages.dev', 
  methods: ['GET', 'POST'], 
  credentials: true, 
};

app.use(cors(corsOptions));


// Route to get selected formats for a YouTube video
app.get('/get-formats', (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).json({ error: true, message: 'No video URL provided.' })
  }

  exec(`yt-dlp --print "title,description,thumbnail" ${videoUrl}`, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: true, message: 'Error fetching metadata.', details: stderr })
    }


    const lines = stdout.split('\n').filter(Boolean)
    const title = lines[0] || 'Unknown Title'
    let description = lines[1] || 'No description available'
    description = description.split(' ').slice(0, 20).join(' ')
    const thumbnail = lines[2] || ''

    const validThumbnail = thumbnail.includes('http') ? thumbnail : ''

    // Step 2: Get available formats
    exec(`yt-dlp -F ${videoUrl}`, (error, formatStdout, formatStderr) => {
      if (error) {
        return res.status(500).json({ error: true, message: 'Error fetching formats.', details: formatStderr });
      }

      const formats = parseFormats(formatStdout);

      if (formats.length === 0) {
        return res.status(404).json({ error: true, message: 'No formats available.' })
      }

      const selectedFormats = filterFormats(formats);

      // Step 4: Get download link for each selected format
      const promises = selectedFormats.map(format => {
        return new Promise((resolve, reject) => {
          const formatID = format.id;
          if (!formatID) {
            return reject({ error: true, message: `Invalid format ID for ${format.format}` })
          }

          exec(`yt-dlp -f ${formatID} -g ${videoUrl}`, (err, linkStdout, linkStderr) => {
            if (err) {
              return reject({ error: true, message: `Error fetching download link for format ${formatID}.`, details: linkStderr })
            }

            format.download_link = linkStdout.trim() 
            resolve(format)
          });
        });
      });

      // Step 5: Wait for all download links to be fetched
      Promise.all(promises)
        .then(formatsWithLinks => {
          return res.json({
            error: false,
            formats: formatsWithLinks,
            title: title,            
            description: description,
          });
        })
        .catch(err => {
          return res.status(500).json(err);
        });
    });
  });
});


// Helper function to parse yt-dlp output
function parseFormats(stdout) {
  const lines = stdout.split('\n');
  const formatList = [];

  lines.forEach(line => {
    const format = line.match(
      /(\S+)\s+(\S+)\s+(\S+|\d+x\d+|\w+\sonly)\s+(\S+)?\s*\|\s*(\S+)?\s*(\S+)?\s*(https|m3u8)?\s*\|\s*(\S+)?\s*(\S+)?\s*(\S+)?/
    )
    if (format) {
      formatList.push({
        id: format[1],              
        extension: format[2],      
        resolution: format[3],      
        fps: format[4] || null,     
        filesize: format[5] || 'N/A',   
        tbr: format[6] || 'N/A',        
        download_link: format[7],   
        codec: format[8] || 'N/A',  
        abr: format[9] || 'N/A',    
        asr: format[10] || 'N/A',  
      })
    }
  })

  return formatList;
}

function filterFormats(formats) {
  // Define the desired resolutions and highest quality mp3 format
  const desiredResolutions = ['854x480', '1280x720', '1920x1080','1920x1080','3840x2160','4096x2160'];
  let highestMp3 = null;

  const filteredFormats = formats.filter(format => {

    if (format.extension === 'mp4' || format.extension === 'webm') {
      if (desiredResolutions.includes(format.resolution)) {
        return true;
      }
    }

    if (format.extension === 'm4a' && format.resolution === 'audio only') {
      if (!highestMp3 || (format.abr && parseInt(format.abr) > parseInt(highestMp3.abr))) {
        highestMp3 = format;
      }
    }
    return false;
  });


  if (highestMp3) {
    filteredFormats.push(highestMp3);
  }

  return filteredFormats;
}

app.listen(process.env.PORT || 4003, () => {
  console.log("running");
});
