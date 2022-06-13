import { notPost, checkFileNeedUpload } from '../utils/common'

export default (req, res) => {
  notPost(req.method)

  const { md5, fileName } = req.body
  checkFileNeedUpload(md5, fileName)
    .then((data) => res.send(data))
}