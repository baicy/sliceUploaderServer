import path from 'path'
import {
  existsSync,
  ensureDirSync,
  readdirSync,
  readFileSync,
  writeFile,
  writeFileSync,
  appendFileSync,
  rename,
  unlink,
  unlinkSync,
  rmdirSync,
  createReadStream,
  statSync
} from 'fs-extra'
import mime from 'mime'

const uploadDir = './uploads'

export const notPost = (method) => {
  if(method !== 'POST') {
    res.send('Not Found')
  }
}

export const getExistFiles = () => {
  const files = []
  // 查找md5对应文件名数据库文件, 没有即创建
  if (!existsSync(path.join(uploadDir, 'md5.db'))) {
    writeFileSync(path.join(uploadDir, 'md5.db'), '{}', { encoding: 'utf-8' })
  }
  const db = JSON.parse(readFileSync(path.join(uploadDir, 'md5.db'), { encoding: 'utf-8' }))
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

/**
 * 查找文件是否存在
 * @param {string} md5
 * @param {string} fileName
 * @returns false || fileName
 */
const checkFileExist = (md5, fileName) => {
  // 查找md5对应文件名数据库文件, 没有即创建
  if (!existsSync(path.join(uploadDir, 'md5.db'))) {
    writeFile(path.join(uploadDir, 'md5.db'), '{}', { encoding: 'utf-8' }, (err) => console.log(err))
    return false // 数据库未初始化, 没有上传过文件, 什么都不存在
  }
  // 查找md5对应文件是否存在, 是否有其他名字的相同文件
  const db = JSON.parse(readFileSync(path.join(uploadDir, 'md5.db'), { encoding: 'utf-8' }))
  if (Object.keys(db).includes(md5)) {
    if (!db[md5].includes(fileName)) {
      // md5对应的文件名列表中没有该文件, 添加对应
      db[md5] = [...db[md5], fileName]
      writeFile(path.join(uploadDir, 'md5.db'), JSON.stringify(db), { encoding: 'utf-8' }, (err) => console.log(err))
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
export const checkFileNeedUpload = (md5, fileName) => {
  return new Promise((resolve) => {
    // 查找是否存在md5对应文件
    checkFileExist(md5, fileName) && resolve({ exist: true })

    // 系统上传过文件, 未在数据库中找到记录, 查找是否有断点上传的文件夹
    if (existsSync(path.join(uploadDir, md5))) {
      const chunkList = readdirSync(path.join(uploadDir, md5))
      resolve({ exist: true, chunkList: chunkList.map((i) => Number(i)) }) // 返回分片列表
    } else {
      resolve({ exist: false }) // 文件不存在, 需要上传
    }
  })
}

export const uploadChunk = ({ filepath, md5, index }) => {
  ensureDirSync(path.resolve(uploadDir, md5))

  return new Promise((resolve, reject) => {
    rename(filepath, path.resolve(uploadDir, md5, index), (err) => {
      if (err) {
        reject(index)
      } else {
        resolve(index)
      }
    })
  })
}

export const mergeChunks = ({ md5, fileName, total }) => {
  const chunks = readdirSync(path.resolve(uploadDir, md5))
  if (chunks.length !== total) {
    return {
      ok: 0,
      msg: '文件分片数出错',
      chunks,
      total,
    }
  }

  chunks.sort((a, b) => a - b)
  writeFileSync(path.resolve(uploadDir, fileName), '')
  for (let i = 0; i < total; i++) {
    const filePath = path.resolve(uploadDir, md5, `${i}`)
    appendFileSync(path.resolve(uploadDir, fileName), readFileSync(filePath))
    unlinkSync(filePath)
  }
  rmdirSync(path.resolve(uploadDir, md5))

  const db = JSON.parse(readFileSync(path.join(uploadDir, 'md5.db'), { encoding: 'utf-8' }))
  db[md5] = [...(db[md5] || []), fileName]
  writeFileSync(path.join(uploadDir, 'md5.db'), JSON.stringify(db), { encoding: 'utf-8' })

  return { ok: 1, data: { md5, fileName } }
}

export const sendFile = ({ fileName, md5 }) => {
  return new Promise((resolve, reject) => {
    const dbFileName = checkFileExist(md5, fileName)
    console.log(dbFileName)

    if(dbFileName) {
      const filePath = path.resolve(uploadDir, dbFileName)

      const stream = createReadStream(filePath)
      const buffers = []
      stream.on('data', (data) => {
        buffers.push(data)
      })
      stream.on('end', () => {
        resolve({
          headers: {
            'Content-Disposition': `attachment; filename=${encodeURIComponent(fileName)}`,
            'Content-Type': mime.getType(filePath),
            'Content-Length': statSync(filePath).size
          },
          buffer: Buffer.concat(buffers)
        })
      })
    } else {
      reject({ ok: 0, msg: '文件不存在' })
    }
  })
}

export const deleteFile = ({ md5, fileName }) => {
  const db = JSON.parse(readFileSync(path.join(uploadDir, 'md5.db'), { encoding: 'utf-8' }))
  if(!Object.keys(db).includes(md5)) {
    return { ok: 0, md5, fileName, msg: '文件不存在'}
  }
  const index = db[md5].indexOf(fileName)
  if(index===0) {
    if(db[md5].length===1) {
      unlink(path.resolve(uploadDir, db[md5][0]), (err) => console.error(err))
      delete(db[md5])
    } else {
      rename(path.resolve(uploadDir, fileName), path.resolve(uploadDir, db[md5][1]))
      db[md5].splice(0, 1)
    }
  } else if(index!==-1) {
    db[md5].splice(index, 1)
  }

  writeFileSync(path.join(uploadDir, 'md5.db'), JSON.stringify(db), { encoding: 'utf-8' })
  return { ok: 1, md5, fileName }
}
