import { useReducer, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

import './Explore.css';
import DataTable from '../components/DataTable';
import IndexDataTable from '../components/IndexDataTable';
import FilterDataTable from '../components/FilterDataTable';
import Scatter from '../components/Scatter';
import AnnotationPlot from '../components/AnnotationPlot';
import HullPlot from '../components/HullPlot';


const apiUrl = import.meta.env.VITE_API_URL
const readonly = import.meta.env.MODE == "read_only"

// unfortunately regl-scatter doesn't even render in iOS
const isIOS = () => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
// let's warn mobile users (on demo in read-only) that desktop is better experience
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};


const initialState = {
  dataset: null,

}

function reducer(state, action) {
}


function processHulls(labels, points) {
  return labels.map(d => {
    return d.hull.map(i => points[i])
  })
}

function Explore() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, scope: scopeId } = useParams();

  const navigate = useNavigate();

  const containerRef = useRef(null);

  // let's fill the container and update the width and height if window resizes
  const [scopeWidth, scopeHeight] = useWindowSize();
  function useWindowSize() {
    const [size, setSize] = useState([500,500]);
    useEffect(() => {
      function updateSize() {
        if(!containerRef.current) return
        const { height, width } = containerRef.current.getBoundingClientRect()
        // console.log("width x height", width, height)
        let swidth = width > 500 ? 500 : width - 50
        setSize([swidth, swidth]);
      }
      window.addEventListener('resize', updateSize);
      updateSize();
      setTimeout(updateSize, 100)
      return () => window.removeEventListener('resize', updateSize);
    }, []);
    return size;
  }

  // Tabs
  const tabs = [
    { id: 0, name: "Selected" },
    { id: 1, name: "Search" },
    { id: 2, name: "Clusters" },
    { id: 3, name: "Tags" },
  ]
  const [activeTab, setActiveTab] = useState(0)
  // const [activeTab, setActiveTab] = useState(2)

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => {
        console.log("dataset", data)
        setDataset(data)
      });
  }, [datasetId, setDataset]);

  const [scopes, setScopes] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes`)
      .then(response => response.json())
      .then(data => {
        setScopes(data)
      });
  }, [datasetId, setScopes]);


  const [delay, setDelay] = useState(200)
  const [scope, setScope] = useState(null);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}`)
      .then(response => response.json())
      .then(data => {
        console.log("scope", data)
        setScope(data)
      });
  }, [datasetId, scopeId, setScope]);

  const [embedding, setEmbedding] = useState(null);
  const [umap, setUmap] = useState(null);
  const [clusterIndices, setClusterIndices] = useState([]); // the cluster number for each point
  const [clusterLabels, setClusterLabels] = useState([]);
  // The search model is the embeddings model that we pass to the nearest neighbor query
  // we want to enable searching with any embedding set
  const [searchModel, setSearchModel] = useState(embedding?.id)


  const [embeddings, setEmbeddings] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/embeddings`)
      .then(response => response.json())
      .then(data => {
        // console.log("embeddings", data)
        setEmbeddings(data)
      });
  }, [datasetId, setEmbeddings]);


  const [points, setPoints] = useState([]);
  const [drawPoints, setDrawPoints] = useState([]); // this is the points with the cluster number
  const [hulls, setHulls] = useState([]); 
  useEffect(() => {
    if (scope) {
      setEmbedding(embeddings.find(e => e.id == scope.embedding_id))

      Promise.all([
        fetch(`${apiUrl}/datasets/${datasetId}/umaps/${scope.umap_id}`).then(response => response.json()),
        fetch(`${apiUrl}/datasets/${datasetId}/umaps/${scope.umap_id}/points`).then(response => response.json()),
        fetch(`${apiUrl}/datasets/${datasetId}/clusters/${scope.cluster_id}/labels/${scope.cluster_labels_id.split("-")[3] || scope.cluster_labels_id}`).then(response => response.json()),
        fetch(`${apiUrl}/datasets/${datasetId}/clusters/${scope.cluster_id}/indices`).then(response => response.json())
      ]).then(([umapData, pointsData, labelsData, clusterIndicesData]) => {
        // console.log("umap", umapData);
        setUmap(umapData);

        // console.log("set points")
        const pts = pointsData.map(d => [d.x, d.y])
        setPoints(pts)

        const dpts = pointsData.map((d, i) => [d.x, d.y, clusterIndicesData[i].cluster])
        setDrawPoints(dpts)
        setHulls([])

        // console.log("labels", labelsData);
        setClusterLabels(labelsData);

        // console.log("cluster indices", clusterIndicesData);
        setClusterIndices(clusterIndicesData);

        setTimeout(() => {
          setHulls(processHulls(labelsData, pts))
        }, 100)

      }).catch(error => console.error("Fetching data failed", error));

    }
  }, [datasetId, scope, embeddings, setUmap, setClusterLabels, setEmbedding, setSearchModel]);

  const memoClusterIndices = useMemo(() => {
    return clusterIndices.map(d => d.cluster)
  }, [clusterIndices])


  useEffect(() => {
    if (embedding && embedding.model_id) {
      setSearchModel(embedding.id)
    } else if(embeddings.length) {
      const emb = embeddings.find(d => !!d.model_id)
      if(emb)
        setSearchModel(emb.id)
    }
  }, [embedding, embeddings, setSearchModel])

  useEffect(() => {
    console.log("search model", searchModel)
  }, [searchModel])


  // const [activeUmap, setActiveUmap] = useState(null)
  const handleModelSelect = (model) => {
    console.log("selected", model)
    setSearchModel(model)
  }


  const hydrateIndices = useCallback((indices, setter, distances = []) => {
    fetch(`${apiUrl}/indexed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dataset: datasetId, indices: indices }),
    })
      .then(response => response.json())
      .then(data => {
        if (!dataset) return;
        let rows = data.map((row, index) => {
          return {
            index: indices[index],
            ...row
          }
        })
        setter(rows)
      })
  }, [dataset, datasetId])



  // ====================================================================================================
  // Scatterplot related logic
  // ====================================================================================================
  // this is a reference to the regl scatterplot instance
  // so we can do stuff like clear selections without re-rendering
  const [scatter, setScatter] = useState({})
  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);
  const handleView = useCallback((xDomain, yDomain) => {
    setXDomain(xDomain);
    setYDomain(yDomain);
  }, [setXDomain, setYDomain])
  // Selection via Scatterplot
  // indices of items selected by the scatter plot
  const [selectedIndices, setSelectedIndices] = useState([]);

  const handleSelected = useCallback((indices) => {
    console.log("handle selected", indices)
    setSelectedIndices(indices);
    setActiveTab(0)
    // for now we dont zoom because if the user is selecting via scatter they can easily zoom themselves
    // scatter?.zoomToPoints(indices, { transition: true })
  }, [setSelectedIndices, setActiveTab])

  // Hover via scatterplot or tables
  // index of item being hovered over
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hovered, setHovered] = useState(null);
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      hydrateIndices([hoveredIndex], (results) => {
        setHovered(results[0])
      })
    } else {
      setHovered(null)
    }
  }, [hoveredIndex, setHovered, hydrateIndices])

  const [hoveredCluster, setHoveredCluster] = useState(null);
  useEffect(() => {
    if (hovered && clusterIndices.length && clusterLabels.length) {
      const index = hovered.index
      const cluster = clusterIndices[index]
      const label = clusterLabels[cluster?.cluster]
      setHoveredCluster({ cluster: cluster.cluster, ...label })
    } else {
      setHoveredCluster(null)
    }
  }, [hovered, clusterIndices, clusterLabels, setHoveredCluster])

  const [hoverAnnotations, setHoverAnnotations] = useState([]);
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      setHoverAnnotations([points[hoveredIndex]])
    } else {
      setHoverAnnotations([])
    }
  }, [hoveredIndex, points])

  // ====================================================================================================
  // Tags
  // ====================================================================================================
  const [tagset, setTagset] = useState({});
  useEffect(() => {
    fetch(`${apiUrl}/tags?dataset=${datasetId}`)
      .then(response => response.json())
      .then(data => setTagset(data));
  }, [datasetId])
  const tags = useMemo(() => {
    const tags = []
    for (const tag in tagset) {
      tags.push(tag)
    }
    // console.log("tagset", tagset, tags)
    return tags
  }, [tagset])

  const [tag, setTag] = useState(tags[0]);

  const [tagAnnotations, setTagAnnotations] = useState([]);
  useEffect(() => {
    if (tagset[tag]) {
      const annots = tagset[tag].map(index => points[index])
      setTagAnnotations(annots)
    } else {
      setTagAnnotations([])
      if (scatter && scatter.config) {
        // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
      }
    }
  }, [tagset, tag, points, scatter, setTagAnnotations])

  // Search
  // the indices returned from similarity search
  const [searchIndices, setSearchIndices] = useState([]);
  const [distances, setDistances] = useState([]);

  const searchQuery = useCallback((query) => {
    fetch(`${apiUrl}/search/nn?dataset=${datasetId}&query=${query}&embedding_id=${searchModel}`)
      .then(response => response.json())
      .then(data => {
        // console.log("search", data)
        setDistances(data.distances);
        setSearchIndices(data.indices);
        // scatter?.zoomToPoints(data.indices, { transition: true, padding: 0.2, transitionDuration: 1500 })
      });
  }, [searchModel, datasetId, scatter, setDistances, setSearchIndices]);

  const [searchAnnotations, setSearchAnnotations] = useState([]);
  useEffect(() => {
    const annots = searchIndices.map(index => points[index])
    setSearchAnnotations(annots)
  }, [searchIndices, points])

  // ====================================================================================================
  // Clusters
  // ====================================================================================================
  // indices of items in a chosen slide
  const [slide, setSlide] = useState(null);
  const [slideAnnotations, setSlideAnnotations] = useState([]);
  useEffect(() => {
    if (slide) {
      const annots = slide.indices.map(index => points[index])
      setSlideAnnotations(annots)
    } else {
      setSlideAnnotations([])
      if (scatter && scatter.config) {
        // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
      }
    }
  }, [slide, points, scatter, setSlideAnnotations])

  const [clusterLabel, setClusterLabel] = useState(slide?.label || '');

  useEffect(() => {
    setClusterLabel(slide?.label || '');
  }, [slide]);

  // Handlers for responding to individual data points
  const handleClicked = useCallback((index) => {
    scatter?.zoomToPoints([index], { transition: true, padding: 0.9, transitionDuration: 1500 })
  }, [scatter])
  const handleHover = useCallback((index) => {
    setHoveredIndex(index);
  }, [setHoveredIndex])

  const handleLabelUpdate = useCallback((index, label) => {
    console.log("update label", index, label)
    fetch(`${apiUrl}/datasets/${datasetId}/clusters/${scope.cluster_id}/labels/${scope.cluster_labels_id}/label/${index}?label=${label}`)
      .then(response => response.json())
      .then(_ => {
        fetch(`${apiUrl}/datasets/${datasetId}/clusters/${scope.cluster_id}/labels/${scope.cluster_labels_id}`)
          .then(response => response.json())
          .then(data => {
            console.log("got new labels", data)
            setClusterLabels(data);
            setHulls(processHulls(data, points))
          })
          .catch(console.error);
      })
      .catch(console.error);
  }, [datasetId, scope])

  const clearScope = useCallback(() => {
    setSlide(null)
    // setClusterLabels([])
    // setPoints([])
  }, [])

  function intersectMultipleArrays(...arrays) {
    console.log("ARRAYS", arrays)
    arrays = arrays.filter(d => d.length > 0)
    if (arrays.length === 0) return [];
    if(arrays.length == 1) return arrays[0]
    // Use reduce to accumulate intersections
    return arrays.reduce((acc, curr) => {
        // Convert current array to a Set for fast lookup
        const currSet = new Set(curr);
        // Filter the accumulated results to keep only elements also in the current array
        return acc.filter(x => currSet.has(x));
    });
  }


  const [intersectedIndices, setIntersectedIndices] = useState([])
  // intersect the indices from the various filters
  useEffect(() => {
    console.log("selectedIndices", selectedIndices)
    console.log("searchIndices", searchIndices)
    console.log("slide", slide?.indices)
    console.log("tag", tag)
    console.log("tagset", tagset[tag])
    const indices = intersectMultipleArrays(selectedIndices || [], searchIndices || [], slide?.indices || [], tagset[tag] || [])
    if(indices.length == 0 && selectedIndices.length > 0) {
      indices = selectedIndices
    }
    console.log("indices!", indices)
    setIntersectedIndices(indices)
  }, [selectedIndices, searchIndices, slide, tagset, tag])

  const [intersectedAnnotations, setIntersectedAnnotations] = useState([]);
  useEffect(() => {
    const annots = intersectedIndices.map(index => points[index])
    setIntersectedAnnotations(annots)
  }, [intersectedIndices, points])


  if (!dataset) return <div>Loading...</div>;

  return (
    <div ref={containerRef} className="container">
      <div className="left-column">
        <div className="summary">
          <div className="scope-card">
            {/* <h3> */}
            { isMobileDevice() ? <i>Use a desktop browser for full interactivity!</i> : null}
            <div className='heading'>
              {/* {scope?.label || scope?.id} */}


              <select className="scope-selector" onChange={(e) => {
                clearScope()
                setDelay(2000)
                navigate(`/datasets/${dataset?.id}/explore/${e.target.value}`)
              }}>

                {scopes.map((scopeOption, index) => (
                  <option key={index} value={scopeOption.id} selected={scopeOption.id === scope?.id}>
                    {scopeOption.label} ({scopeOption.id})
                  </option>
                ))}
              </select>
              {readonly ? null : <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure</Link>}
              {readonly ? null : <Link to={`/datasets/${dataset?.id}/export/${scope?.id}`}>Export</Link>}
            </div>
            {/* </h3> */}
            <span>{scope?.description}</span>
            <span>{embedding?.model_id}</span>
            <span>{clusterLabels?.length} clusters</span>
          </div>
          <div className="dataset-card">
            <span><b>{datasetId}</b>  {dataset?.length} rows</span>
          </div>
        </div>
        <div className="umap-container">
          {/* <div className="umap-container"> */}
          <div className="scatters" style={{ width: scopeWidth, height: scopeHeight }}>
            {points.length ? <>
              { !isIOS() ? <Scatter
                points={drawPoints}
                duration={2000}
                width={scopeWidth}
                height={scopeHeight}
                colorScaleType="categorical"
                onScatter={setScatter}
                onView={handleView}
                onSelect={handleSelected}
                onHover={handleHover}
              /> : <AnnotationPlot
              points={points}
              fill="gray"
              size="8"
              xDomain={xDomain}
              yDomain={yDomain}
              width={scopeWidth}
              height={scopeHeight}
            /> }
              {hoveredCluster && hoveredCluster.hull && !scope.ignore_hulls ? <HullPlot
                hulls={processHulls([hoveredCluster], points)}
                fill="lightgray"
                duration={0}
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight} /> : null}

              {slide && slide.hull && !scope.ignore_hulls ? <HullPlot
                hulls={processHulls([slide], points)}
                fill="darkgray"
                strokeWidth={2}
                duration={0}
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight} /> : null}
              {hulls.length && !scope.ignore_hulls ? <HullPlot
                hulls={hulls}
                stroke="black"
                fill="none"
                delay={delay}
                duration={200}
                strokeWidth={1}
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight} /> : null}
              <AnnotationPlot
                points={intersectedAnnotations}
                stroke="black"
                fill="steelblue"
                size="8"
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight}
              />
              {/* <AnnotationPlot
                points={searchAnnotations}
                stroke="black"
                fill="steelblue"
                size="8"
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight}
              />
              <AnnotationPlot
                points={slideAnnotations}
                fill="darkred"
                size="8"
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight}
              />
              <AnnotationPlot
                points={tagAnnotations}
                symbol={tag}
                size="20"
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight}
              /> */}
              <AnnotationPlot
                points={hoverAnnotations}
                stroke="black"
                fill="orange"
                size="16"
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight}
              />

            </> : null}

            {/* </div> */}
          </div>
          {!isMobileDevice() ? <div className="hovered-point">
            {hoveredCluster ? <span><span className="key">Cluster {hoveredCluster.index}:</span><span className="value">{hoveredCluster.label}</span></span> : null}
            {hovered && Object.keys(hovered).map((key,idx) => {
              let d = hovered[key]
              if(typeof d === 'object' && !Array.isArray(d)) {
                d = JSON.stringify(d)
              }
              let meta = dataset.column_metadata && dataset.column_metadata[key]
              let value;
              if(meta && meta.image) {
                value = <span className="value" key={idx}><img src={d} alt={key} height={64} /></span>
              } else if(meta && meta.url) {
                value = <span className="value" key={idx}><a href={d}>url</a></span>
              } else if(meta && meta.type == "array") {
                value = <span className="value" key={idx}>[{d.length}]</span>
              } else {
                value = <span className="value" key={idx}>{d}</span>
              }
              return (
              <span key={key}>
                <span className="key">{key}:</span> 
                {value}
              </span>
            )})}
          </div> : null }
        </div> 
      </div>

      <div className="data">

        {/* <div className="tab-header">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={tab.id === activeTab ? 'tab-active' : 'tab-inactive'}>
              {tab.name}
            </button>
          ))}
        </div> */}
          <div className="filters-container">
            <div className={`filter-row search-box ${searchIndices.length ? 'active': ''}`}>
              <div className="filter-cell left">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  searchQuery(e.target.elements.searchBox.value);
                }}>
                  <input type="text" id="searchBox" placeholder="Nearest Neighbor Search..." />
                  {/* <button type="submit">Similarity Search</button> */}
                  <button type="submit">🔍</button>
                </form>
              </div>
              <div className="filter-cell middle">
                <span>
                  {searchIndices.length ? <span>{searchIndices.length} rows</span> : null}
                  {searchIndices.length > 0 ?
                    <button className="deselect" onClick={() => {
                      setSearchIndices([])
                      document.getElementById("searchBox").value = "";
                    }
                    }>X</button>
                    : null}
                </span>
              </div>
              <div className="filter-cell right">
                <label htmlFor="embeddingModel"></label>
                <select id="embeddingModel"
                  onChange={(e) => handleModelSelect(e.target.value)}
                  value={searchModel}>
                  {embeddings.filter(d => d.model_id).map((emb, index) => (
                    <option key={index} value={emb.id}>{emb.id} - {emb.model_id} - {emb.dimensions}</option>
                  ))}
                </select>
                {/* TODO: tooltip */}
              </div>
            </div>

            <div className={`clusters-select filter-row  ${slide?.indices.length ? 'active': ''}`}>
              <div className="filter-cell left">
                <select onChange={(e) => {
                  if(e.target.value == -1) {
                    setSlide(null)
                    return
                  }
                  const cl = clusterLabels.find(cluster => cluster.index === +e.target.value)
                  if(cl) setSlide(cl)
                }} value={slide?.index >= 0 ? slide.index : -1}>
                  <option value="-1">Select a cluster</option>
                  {clusterLabels.map((cluster, index) => (
                    <option key={index} value={cluster.index}>{cluster.index}: {cluster.label}</option>
                  ))}
                </select>
              </div>
              <div className="filter-cell middle">
                <span>{slide?.indices.length} {slide?.indices.length ? "rows" : ""}
                  {slide ? <button className="deselect" onClick={() => {
                    setSlide(null)
                  }
                  }>X</button>
                    : null}
                </span>
              </div>
              <div className="filter-cell right">
                {slide ?
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    handleLabelUpdate(slide.index, clusterLabel);
                  }}>
                    <input
                      className="update-cluster-label"
                      type="text"
                      id="new-label"
                      value={clusterLabel}
                      onChange={(e) => setClusterLabel(e.target.value)} />
                    <button type="submit">Update Label</button>
                  </form>
                  : null}
              </div>
            </div>

            <div className={`filter-row tags-box ${tagset[tag]?.length ? 'active': ''}`}>
              <div className="filter-cell left tags-select">
                <select onChange={(e) => {
                  if(e.target.value == "-1") {
                    setTag(null)
                    return
                  }
                  setTag(e.target.value)
                }} value={tag ? tag : "-1"}>
                  <option value="-1">Select a tag</option>
                  {tags.map((t, index) => (
                    <option key={index} value={t}>{t} ({tagset[t].length})</option>
                  ))}
                </select>
              </div>
              <div className="filter-cell middle">
                {tag && tagset[tag]?.length ? <span>{tagset[tag].length} rows
                  <button className="deselect" onClick={() => {
                    setTag(null)
                  }
                  }>X</button>
                </span> : null}
              </div>
              <div className="filter-cell right new-tag">
                {readonly ? null : <form onSubmit={(e) => {
                  e.preventDefault();
                  const newTag = e.target.elements.newTag.value;
                  fetch(`${apiUrl}/tags/new?dataset=${datasetId}&tag=${newTag}`)
                    .then(response => response.json())
                    .then(data => {
                      console.log("new tag", data)
                      setTagset(data);
                    });
                }}>
                  <input type="text" id="newTag" />
                  <button type="submit">New Tag</button>
                </form>}
              </div>
            </div>

            <div className={`filter-row ${selectedIndices?.length ? 'active': ''}`}>
              <div className="filter-cell left">
                Click or Shift+Drag on the map to select points.
              </div>
              <div className="filter-cell middle">
                  {selectedIndices?.length > 0 ?<span>{selectedIndices?.length} rows</span> : null}
                  {selectedIndices?.length > 0 ?<button className="deselect" onClick={() => {
                      setSelectedIndices([])
                      scatter?.select([])
                      // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
                    }
                    }>X</button>
                    : null}
              </div>
              <div className="filter-cell right"></div>
            </div>

            <div className="filter-row">
              <div className="filter-cell left">
                {intersectedIndices.length > 0 ? "Intersection of filtered rows:" : "No rows filtered"}
              </div>
              <div className="filter-cell middle intersected-count">
                <span>{intersectedIndices.length} rows</span>
              </div>
              <div className="filter-cell right bulk-actions">
                <button>🏷️</button>
                <button>️📍</button>
                <button>💾</button>
                <button>🗑️</button>
              </div>
            </div>
          </div>

            
            
            <FilterDataTable
                dataset={dataset}
                indices={intersectedIndices}
                clusterIndices={clusterIndices}
                clusterLabels={clusterLabels}
                height={`calc(100% - 250px)`}
            />

{/* {selectedIndices?.length > 0 ?
              <IndexDataTable
                indices={selectedIndices}
                clusterIndices={clusterIndices}
                clusterLabels={clusterLabels}
                tagset={tagset}
                dataset={dataset}
                maxRows={150}
                onTagset={(data) => setTagset(data)}
                onHover={handleHover}
                onClick={handleClicked}
              />
              : null} */}
        
        {/* </div> */}
      </div>
    </div>
  );
}

export default Explore;
