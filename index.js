require('dotenv').config()
const { OMDB_API_KEY, IMDB_URL, OMDB_API_URL, OMDB_POSTER_URL, YT_API_KEY } = process.env
const cheerio = require('cheerio')
const fetch = require('node-fetch')
const fs = require('fs-extra')

const createLink = (id) => {
  return {
    movie: `${OMDB_API_URL}?apikey=${OMDB_API_KEY}&i=${id}`,
    poster: `${OMDB_POSTER_URL}?apikey=${OMDB_API_KEY}&i=${id}&h=556`
  }
}

//* this service webscrapes the IMDB, OMDB & TMDB API's for data and posters.
//* the results are saved in a JSON
const readMovies = async () => {
  // fetch the IMDB page and load it into cheerio
  const res = await fetch(IMDB_URL)
  const body = await res.text()
  const $ = cheerio.load(body)

  // save our movies and posters
  let linkList = []

  // finds each <a> and plucks the "tt0000000"-values from their href-tag
  $('td.posterColumn > a').each(function (i, elem) {
    const id = $(this).attr('href').match(/tt[0-9]{7}/g)[0]
    linkList[i] = createLink(id)
  })

  // makes an API request and resolves the parsed JSON
  const apiRequests = linkList.map(({ movie }) => {
    return fetch(movie).then((res) => {
      try {
        return res.json()
      } catch (e) {
        console.log(`Unable to parse ${movie}`, e)
        return {}
      }
    })
  })

  // wait for all our api requests to resolve and save their output
  const movieData = await Promise.all([ ...apiRequests ])

  // makes an poster API request and resolves the poster URL
  const posterURL = (query) => `https://www.themoviedb.org/search/multi?language=en-EN&query=${query}`
  const posterRequests = movieData.map((movie) => {
    const query = encodeURI(posterURL(movie.Title))
    return fetch(query).then((res) => res.json()).then((res) => {
      if (typeof res.results['0'] === 'undefined') {
        return null
      } else {
        return res.results['0']['poster_path']
      }
    })
  })

  // wait for all our poster requests to resolve
  const posterData = await Promise.all([ ...posterRequests ])

  // make youtube requests for each movie
  const fetchTrailer = movieData.map((movie) => {
    const DOMAIN = 'https://content.googleapis.com/youtube/v3/search'
    const SEARCH_TERM = encodeURI(movie.Title + ' trailer HD')
    const QUERY = `?q=${SEARCH_TERM}&maxResults=25&part=snippet&key=${YT_API_KEY}`
    return fetch(`${DOMAIN}${QUERY}`, {
      headers: { referer: 'https://developers.google.com' }
    })
      .then((res) => res.json())
      .then((res) => {
        if (typeof res['items'][0]['id']['videoId'] === 'undefined') {
          console.log('no videoid')
          return null
        } else {
          return res['items'][0]['id']['videoId']
        }
      })
  })

  // wait for all our trailer URLs to resolve
  const trailers = await Promise.all([ ...fetchTrailer ])

  // our output that gets turned into json
  let output = {}
  let startId = 10010

  movieData.forEach((movie, i) => {
    output[startId] = {
      Description: movie.Plot || '',
      Poster: posterData[i]
        ? `https://image.tmdb.org/t/p/w370_and_h556_bestv2${posterData[i]}`
        : 'http://placehold.it/370x556',
      Source: trailers[i] || 'dQw4w9WgXcQ',
      imdbRating: movie.imdbRating || 'TBA',
      Title: movie.Title || '',
      Year: movie.Year || '',
      imdbID: movie.imdbID || '',
      Type: movie.Type || ''
    }
    startId++
  })

  // save our file into json
  try {
    await fs.writeJson(`./results/results.${+new Date()}.json`, output)
    console.log('successfully saved results into a json')
  } catch (e) {
    console.log('Save operation failed', e)
  }
}

readMovies()
