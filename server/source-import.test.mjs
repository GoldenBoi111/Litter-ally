import test from 'node:test'
import assert from 'node:assert/strict'
import { extractOfficeSource } from './source-import.mjs'

function zip(files) {
  const local = []
  const central = []
  let offset = 0
  for (const [name, value] of Object.entries(files)) {
    const filename = Buffer.from(name)
    const data = Buffer.from(value)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50)
    header.writeUInt16LE(20, 4)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(filename.length, 26)
    local.push(header, filename, data)

    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt32LE(data.length, 20)
    directory.writeUInt32LE(data.length, 24)
    directory.writeUInt16LE(filename.length, 28)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, filename)
    offset += header.length + filename.length + data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}

test('XLSX worksheet names follow workbook relationship order, not sheet filenames', () => {
  const source = extractOfficeSource(zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Summary" r:id="rId1"/><sheet name="Raw Data" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet2.xml"/><Relationship Id="rId2" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>raw</v></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>summary</v></c></row></sheetData></worksheet>',
  }), 'lesson.xlsx')

  assert.deepEqual(source.sourceSegments.map(({ text, locator }) => [text, locator.sheet]), [
    ['A1=summary', 'Summary'],
    ['A1=raw', 'Raw Data'],
  ])
})
