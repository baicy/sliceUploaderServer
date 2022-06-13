const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const path = require('path')
const fs = require('fs-extra')
const formidable = require('formidable')

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

const uploadDir = './uploads'

/**
 * 查找文件是否存在
 * @param {string} md5
 * @param {string} fileName
 * @returns false || fileName
 */
function checkFileExist(md5, fileName) {
  // 查找md5对应文件名数据库文件, 没有即创建
  if (!fs.existsSync(path.join(uploadDir, 'md5.db'))) {
    fs.writeFile(path.join(uploadDir, 'md5.db'), '{}', { encoding: 'utf-8' }, (err) => console.log(err))
    return false // 数据库未初始化, 没有上传过文件, 什么都不存在
  }
  // 查找md5对应文件是否存在, 是否有其他名字的相同文件
  const db = JSON.parse(fs.readFileSync(path.join(uploadDir, 'md5.db'), { encoding: 'utf-8' }))
  if (Object.keys(db).includes(md5)) {
    if (!db[md5].includes(fileName)) {
      // md5对应的文件名列表中没有该文件, 添加对应
      db[md5] = [...db[md5], fileName]
      fs.writeFile(path.join(uploadDir, 'md5.db'), JSON.stringify(db), { encoding: 'utf-8' }, (err) => console.log(err))
    }
    return db[md5][0]
  }
  return false
}

/**
 * 检查是否需要进行上传
 * @param {string} md5
 * @param {string} fileName 文件名
 * @returns Promise
 */
function checkFileNeedUpload(md5, fileName) {
  return new Promise((resolve) => {
    // 查找是否存在md5对应文件
    checkFileExist(md5, fileName) && resolve({ exist: true })

    // 系统上传过文件, 未在数据库中找到记录, 查找是否有断点上传的文件夹
    if (fs.existsSync(path.join(uploadDir, md5))) {
      const chunkList = fs.readdirSync(path.join(uploadDir, md5))
      resolve({ exist: true, chunkList: chunkList.map((i) => Number(i)) }) // 返回分片列表
    } else {
      resolve({ exist: false }) // 文件不存在, 需要上传
    }
  })
}

function clearFiles() {
  fs.readdirSync(path.resolve(uploadDir)).forEach((file) => {
    if (!['.DS_Store', 'md5.db', '.gitkeep'].includes(file) && !fs.lstatSync(path.resolve(uploadDir, file)).isDirectory()) {
      fs.unlink(path.resolve(uploadDir, file), (err) => console.error(err))
    }
  })
  fs.writeFile(path.join(uploadDir, 'md5.db'), '{}', { encoding: 'utf-8' }, (err) => console.error(err))
}

function moveChunk(tmp, md5, index) {
  return new Promise((resolve, reject) => {
    fs.rename(tmp, path.resolve(uploadDir, md5, index), (err) => {
      if (err) {
        reject(index)
      } else {
        resolve(index)
      }
    })
  })
}

function getExistFiles() {
  const files = []
  const db = JSON.parse(fs.readFileSync(path.join(uploadDir, 'md5.db'), { encoding: 'utf-8' }))
  for(let md5 in db) {
    db[md5].forEach(v=>{
      files.push({
        md5,
        name: v,
        percent: 100,
        status: 'uploaded'
      })
    })
  }
  return files
}

app.post('/check', (req, res) => {
  const { md5, fileName } = req.body
  checkFileNeedUpload(md5, fileName).then((data) => res.send(data))
})

app.post('/upload/*', (req, res) => {
  const form = new formidable.IncomingForm({ uploadDir: './tmp' })
  form.parse(req, function (err, fields, file) {
    const { md5, index } = fields
    fs.ensureDirSync(path.resolve(uploadDir, md5))
    moveChunk(file.data.filepath, md5, index).then(
      (data) => res.send({ ok: 1, md5, chunk: data }),
      (error) => res.send({ ok: 0, md5, chunk: error, msg: '上传失败' })
    )
  })
})

app.post('/merge', (req, res) => {
  const { md5, fileName, total } = req.body
  const chunks = fs.readdirSync(path.resolve(uploadDir, md5))
  if (chunks.length !== total) {
    res.send({
      ok: 0,
      msg: '文件分片数出错',
      chunks,
      total,
    })
  }

  chunks.sort((a, b) => a - b)
  fs.writeFileSync(path.resolve(uploadDir, fileName), '')
  for (let i = 0; i < total; i++) {
    const filePath = path.resolve(uploadDir, md5, `${i}`)
    fs.appendFileSync(path.resolve(uploadDir, fileName), fs.readFileSync(filePath))
    fs.unlinkSync(filePath)
  }
  fs.rmdirSync(path.resolve(uploadDir, md5))

  const db = JSON.parse(fs.readFileSync(path.join(uploadDir, 'md5.db'), { encoding: 'utf-8' }))
  db[md5] = [...(db[md5] || []), fileName]
  fs.writeFileSync(path.join(uploadDir, 'md5.db'), JSON.stringify(db), { encoding: 'utf-8' })

  res.send({ ok: 1, data: { md5, fileName } })
})

app.post('/delete/*', (req, res) => {
  const { md5, fileName } = req.body
  const db = JSON.parse(fs.readFileSync(path.join(uploadDir, 'md5.db'), { encoding: 'utf-8' }))
  if(!Object.keys(db).includes(md5)) {
    res.send({ ok: 0, md5, fileName, msg: '文件不存在'})
  }
  const index = db[md5].indexOf(fileName)
  if(index===0) {
    if(db[md5].length===1) {
      fs.unlink(path.resolve(uploadDir, db[md5][0]), (err) => console.error(err))
      delete(db[md5])
    } else {
      fs.rename(path.resolve(uploadDir, fileName), path.resolve(uploadDir, db[md5][1]))
      db[md5].splice(0, 1)
    }
  } else if(index!==-1) {
    db[md5].splice(index, 1)
  }

  fs.writeFileSync(path.join(uploadDir, 'md5.db'), JSON.stringify(db), { encoding: 'utf-8' })
  res.send({ ok: 1, md5, fileName })
})

app.post('/test', (req, res) => {
  res.send(getExistFiles())
})

app.post('/download/*', (req, res) => {
  const { fileName, md5 } = req.body
  const dbFileName = checkFileExist(md5, fileName)
  if (dbFileName) {
    res.header({ 'Content-Disposition': `attachment; filename=${encodeURIComponent(fileName)}` })
    res.sendFile(path.resolve(uploadDir, dbFileName))
  } else {
    res.send({ ok: 0, msg: '文件不存在' })
  }
})

const server = app.listen(8080, () => {
  console.log('server start, run on http://localhost:8080/')
  if (server.address().address === '::') {
    clearFiles()
  }
})
