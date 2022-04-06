require('dotenv/config')
const { createClient } = require('contentful')
const {
  documentToPlainTextString,
} = require('@contentful/rich-text-plain-text-renderer')
const ObjectsToCsv = require('objects-to-csv')

const path = './products.csv'

const contentfulClient = createClient({
  space: process.env.CTF_SPACE_ID,
  accessToken: process.env.CTF_PREVIEW
    ? process.env.CTF_PREW_ACCESS_TOKEN
    : process.env.CTF_CDA_ACCESS_TOKEN,
  environment: process.env.CTF_ENVIRONMENT || 'master',
  removeUnresolved: true,
  host: process.env.CTF_PREVIEW
    ? 'preview.contentful.com'
    : 'cdn.contentful.com',
})

const exportCsv = async () => {
	const products = await fetchProducts()
	const items = products
		.map(createFeedItem)
		.filter(Boolean)
	await createCsv(items, path)
}

const fetchProducts = async () => {
  let allItems = []
  const limit = 100
  let skip = 0
  let hasMore = false

  do {
    const { items, total } = await contentfulClient.getEntries({
      content_type: 'topicProduct',
      include: 1,
      limit,
      skip,
      locale: '*',
    })

    allItems = allItems.concat(items)
    hasMore = total && allItems.length < total
    skip += limit
  } while (hasMore)

  return allItems
}

const createFeedItem = (product) => {
	try {
		const variant = getFirstLocaleVersion(product.fields.variants)[0]
		const microCategories = getFirstLocaleVersion(product.fields.category)
		const microColor = getFirstLocaleVersion(product.fields.microColor)
		const macroColor = getFirstLocaleVersion(product.fields.macroColor)

		// size class
		return {
			MFC: getFirstLocaleVersion(product.fields.mfc),
			size_class: getFirstLocaleVersion(variant.fields.sizeClass),
			...mapObjectKeys(product.fields.name, prefix, 'name'),
			...mapObjectKeys(
				mapObjectValues(product.fields.description, documentToPlainTextString),
				prefix,
				'description',
			),
			...mapObjectKeys(
				mapObjectValues(product.fields.details, replaceNewLines),
				prefix,
				'details',
			),
			...(microCategories
				? concatenateObjectsValuesWithEqualKey(
					microCategories.map((microCategory) =>
						mapObjectKeys(microCategory.fields.name, prefix, 'micro_category'),
					),
				)
				: {}),
			...(microColor
				? mapObjectKeys(microColor.fields.name, prefix, 'micro_color')
				: {}),
			...(macroColor
				? mapObjectKeys(macroColor.fields.name, prefix, 'macro_color')
				: {}),
		}
	} catch (err) {
		console.error(`Error! The product with id "${product.sys.id}" probably has some fields missing.`)
	}
}

const getFirstLocaleVersion = (field) => Object.values(field)[0]

const mapObjectKeys = (obj, fn, ...fnArgs) =>
  Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [fn(key, ...fnArgs), value]),
  )

const mapObjectValues = (obj, fn, ...fnArgs) =>
  Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, fn(value, ...fnArgs)]),
  )

const concatenateObjectsValuesWithEqualKey = (objects) => {
  const keys = [...new Set(objects.flatMap((obj) => Object.keys(obj)))]

  return Object.fromEntries(
    keys.map((key) => [
      key,
      objects.map((obj) => obj[key] || Object.values(obj)[0]).join(', '),
    ]),
  )
}

const prefix = (string, prefix) => `${prefix}_${string}`

const replaceNewLines = (text) => text.split('\n').join(' ')

const createCsv = async (data, path) => {
  const csv = new ObjectsToCsv(data, {
    allColumns: true,
  })
  await csv.toDisk(path)
}

exportCsv()
  .then(() => console.log('Done!'))
  .catch((err) => console.error(err))
