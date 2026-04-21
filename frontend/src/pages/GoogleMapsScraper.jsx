import { useState, useEffect } from 'react'
import axios from 'axios'
import toast, { Toaster } from 'react-hot-toast'

function GoogleMapsScraper() {
  const [url, setUrl] = useState('')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [error, setError] = useState('')
  const [count, setCount] = useState(0)
  const [progress, setProgress] = useState('')
  const [hasScraped, setHasScraped] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (url.trim() && url.includes('google.com/maps') && !loading && !hasScraped) {
        handleScrape()
      }
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [url])

  const handleScrape = async () => {
    if (!url.trim()) {
      setError('Please enter a Google Maps URL')
      return
    }
    
    if (!url.includes('google.com/maps')) {
      setError('Please enter a valid Google Maps URL')
      return
    }
    
    setLoading(true)
    setScraping(true)
    setError('')
    setData([])
    setProgress('Loading page...')
    
    try {
      const response = await axios.post('/api/google-maps-scrape', { url }, {
        timeout: 300000
      })
      
      const responseData = response.data?.data || []
      setData(responseData)
      setCount(response.data?.count || responseData.length)
      setProgress('')
      setHasScraped(true)
      
      if (responseData.length === 0) {
        setError('No business data found. Try a different URL.')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to scrape data. Please try again.')
      setProgress('')
    } finally {
      setLoading(false)
      setScraping(false)
    }
  }

  const handleDownload = async () => {
    try {
      const response = await axios.post('/api/google-maps-download', { data }, {
        responseType: 'blob'
      })
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      const link = document.createElement('a')
      link.href = window.URL.createObjectURL(blob)
      link.download = `google-maps-data-${Date.now()}.xlsx` 
      link.click()
    } catch (err) {
      setError('Failed to download file')
    }
  }

  const handleReset = () => {
    setUrl('')
    setData([])
    setCount(0)
    setError('')
    setHasScraped(false)
    setProgress('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 p-4">
      <Toaster position="top-right" />
      <div className="max-w-7xl mx-auto">
        <div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2 text-center">
            Google Maps Scraper
          </h1>
          <p className="text-gray-600 text-center mb-6">
            Auto-extract all business data: Name, Address, Phone, Website
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border border-gray-200">
          <label className="block text-gray-700 text-sm font-semibold mb-3">
            Paste Google Maps URL
          </label>
          <div className="flex gap-4">
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setHasScraped(false)
              }}
              placeholder="https://www.google.com/maps/search/dental+doctors+in+delhi"
              className="flex-1 px-5 py-4 bg-gray-50 border border-gray-300 text-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500 text-lg"
            />
            {hasScraped && (
              <button
                onClick={handleReset}
                className="px-6 py-4 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-all"
              >
                Reset
              </button>
            )}
            <button
              onClick={handleScrape}
              disabled={loading}
              className="px-10 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Scraping...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Extract Data
                </>
              )}
            </button>
          </div>
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            </div>
          )}
        </div>


        {scraping && (
          <div className="bg-white rounded-xl shadow-2xl p-8 mb-6 border border-gray-200">
            <div className="flex items-center justify-center gap-4 mb-4">
              <svg className="animate-spin h-10 w-10 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="text-blue-600 text-lg font-medium">{progress || 'Scraping...'}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
            <p className="text-gray-600 text-sm text-center mt-4">
              Continuously scrolling and extracting all available business data...
            </p>
          </div>
        )}


        {data.length > 0 && (
          <div className="bg-white rounded-xl shadow-2xl p-6 border border-gray-200">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Scraped Results
                </h2>
                <p className="text-gray-600 mt-1">
                  Found <span className="text-green-600 font-bold text-xl">{count}</span> businesses with complete data
                </p>
              </div>
              <button
                onClick={handleDownload}
                className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-all flex items-center gap-2 shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Excel
              </button>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="flex items-center justify-between">
                <p className="text-gray-700 text-sm">
                  Showing <span className="font-bold text-gray-800">{data.length}</span> businesses
                  {data.length >= 200 && (
                    <span className="ml-2 px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                      200+ Target Reached! 🎯
                    </span>
                  )}
                </p>
                <p className="text-gray-500 text-xs">
                  Scroll to view all results
                </p>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full sticky top-0">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-gray-700 font-semibold rounded-tl-lg w-16 text-sm">#</th>
                    <th className="px-4 py-3 text-gray-700 font-semibold text-sm">Business Name</th>
                    <th className="px-4 py-3 text-gray-700 font-semibold text-sm">Address</th>
                    <th className="px-4 py-3 text-gray-700 font-semibold w-40 text-sm">Phone</th>
                    <th className="px-4 py-3 text-gray-700 font-semibold rounded-tr-lg text-sm">Website</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data && data.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 text-sm font-medium">{index + 1}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium text-sm">{item?.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs">
                        {item?.address ? (
                          <span className="line-clamp-2 text-sm" title={item.address}>{item.address}</span>
                        ) : (
                          <span className="text-gray-400 italic text-sm">No address</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item?.phone ? (
                          <a 
                            href={`tel:${item.phone}`} 
                            className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm"
                          >
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <span className="truncate">{item.phone}</span>
                          </a>
                        ) : (
                          <span className="text-gray-400 italic text-sm">No phone</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item?.website ? (
                          <a 
                            href={item.website} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-600 hover:text-blue-700 flex items-center gap-1 max-w-xs text-sm"
                          >
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                            <span className="truncate">{item.website?.replace(/^https?:\/\//, '') || item.website}</span>
                          </a>
                        ) : (
                          <span className="text-gray-400 italic text-sm">No website</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 text-sm text-center">
                Successfully extracted {count} businesses! Click "Download Excel" to save all data.
              </p>
            </div>
          </div>
        )}

        {data.length === 0 && !loading && (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <svg className="w-20 h-20 mx-auto text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-600 text-xl mb-4">
              Paste a Google Maps URL to extract business data
            </p>
            <div className="text-left max-w-lg mx-auto bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 text-sm font-semibold mb-2">How it works:</p>
              <ol className="text-gray-600 text-sm space-y-1 list-decimal list-inside">
                <li>Paste a Google Maps search URL</li>
                <li>Scraper automatically starts extracting</li>
                <li>Scrolls through all pages continuously</li>
                <li>Extracts: Name, Address, Phone, Website</li>
                <li>Download all data as Excel file</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GoogleMapsScraper
