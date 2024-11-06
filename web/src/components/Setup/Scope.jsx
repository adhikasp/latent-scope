// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStartJobPolling } from '../Job/Run';
import JobProgress from '../Job/Progress';
import { apiService, apiUrl } from '../../lib/apiService';
import { useSetup } from '../../contexts/SetupContext';


function Scope() {
  const { dataset, scope, updateScope, goToNextStep } = useSetup();

  const navigate = useNavigate();

  const [scopeJob, setScopeJob] = useState(null);
  const { startJob: startScopeJob} = useStartJobPolling(dataset, setScopeJob, `${apiUrl}/jobs/scope`);
  const { startJob: startDeleteScopeJob} = useStartJobPolling(dataset, setScopeJob, `${apiUrl}/jobs/delete/scope`);

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');

  const [embedding, setEmbedding] = useState(null);
  const [umap, setUmap] = useState(null);
  const [cluster, setCluster] = useState(null);
  const [clusterLabelId, setClusterLabelId] = useState(null);

  const [embeddings, setEmbeddings] = useState([]);
  const [umaps, setUmaps] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [scopes, setScopes] = useState([]);

  // Fetch initial data
  useEffect(() => {
    if(dataset) {
      apiService.fetchEmbeddings(dataset?.id).then(embs => setEmbeddings(embs))
      apiService.fetchUmaps(dataset?.id).then(umaps => setUmaps(umaps))
      apiService.fetchClusters(dataset?.id).then(cls => setClusters(cls))
    }
  }, [dataset])

  // Set initial input values based on scope prop
  useEffect(() => {
    if (scope) {
      setLabel(scope.label);
      setDescription(scope.description);
      if(scope.embedding_id) {
        const emb = embeddings.find(e => e.id == scope.embedding_id)
        setEmbedding(emb)
      }
      if(scope.umap_id) {
        const um = umaps.find(u => u.id == scope.umap_id)
        setUmap(um)
      }
      if(scope.cluster_id) {
        const cl = clusters.find(c => c.id == scope.cluster_id)
        setCluster(cl)
      }
      if(scope.cluster_labels_id) {
        setClusterLabelId(scope.cluster_labels_id)
      }
    }
  }, [scope]);

  useEffect(() => {
    if(dataset) {
      console.log("fetching scopes")
      apiService.fetchScopes(dataset.id).then(scopes => {
        setScopes(scopes)
      })
    }
  }, [dataset]);



  useEffect(() => {
    if(scopeJob?.status == "completed") {
      console.log("completed", scopeJob)
      // fetchScopes(dataset.id, onNew)
      // fetchScopes(dataset.id, (scopes) => {
      //   setScopeJob(null)
      //   onNew(scopes)
      //   onChange(scopes.find(d => d.id == scopeJob.run_id))
      //   navigate(`/datasets/${dataset.id}/setup/${scopeJob.run_id}`);
      // })
    }
  }, [scopeJob, dataset]);


  const handleSaveScope = useCallback((event) => {
    event.preventDefault();
    if(!umap || !cluster) return;
    const form = event.target;
    const data = new FormData(form);
    const action = data.get('action')

    if(action == "description") {
      console.log("update the description")
      fetch(`${apiUrl}/datasets/${dataset.id}/scopes/${scope.id}/description?description=${data.get('description')}&label=${data.get('label')}`, {
        method: 'GET',
      }).then(response => response.json()).then(data => {
        console.log("updated description", data)
        fetchScopes(dataset.id, onNew)
      }).catch(error => {
        console.error('Error updating description:', error);
      });
      return;
    }

    const payload = {
      embedding_id: embedding.id,
      umap_id: umap.id,
      cluster_id: cluster.id,
      cluster_labels_id: clusterLabelId,
      label: data.get('label'),
      description: data.get('description')
    };

    console.log("action", action)
    if(action == "save") {
      payload.scope_id = scope.id
    }
    startScopeJob(payload)

  }, [dataset, scope, cluster, clusterLabelId, umap, embedding]);

  const [isDifferent, setIsDifferent] = useState(false);
  const descriptionIsDifferent = label !== scope?.label || description !== scope?.description;

  useEffect(() => {
    if(!scope) {
      setIsDifferent(true);
    } else {
      if(scope.embedding_id != embedding?.id
        || scope.umap_id != umap?.id
        || scope.cluster_id != cluster?.id
        || scope.cluster_labels_id != clusterLabelId) {
        setIsDifferent(true);
      } else {
        setIsDifferent(false)
      }
    }
  }, [scope, cluster, umap, embedding, clusterLabelId]);

  return (
    <div className="setup-scope">
      <div className="dataset--setup-save-box-title">
        Embedding: {embedding?.id} - {embedding?.model_id}<br/>
        Umap: {umap?.id}<br/>
        Cluster: {cluster?.id}<br/>
        Labels: {clusterLabelId }
      </div>
      <div className="dataset--setup-save-box-boxes">
        { cluster ? <div className="box-item">
          {/* {cluster.id} */}
          <img src={cluster.url} alt={cluster.id} />
        </div> : 
          umap ? <div className="box-item">
            {/* {umap.id} */}
            <img src={umap.url} alt={umap.id} />
          </div> : <div className="empty-box"></div> 
        }
      </div>
      <div className="dataset--setup-save-box-nav">
        <form onSubmit={handleSaveScope}>
          <label>
            Label:
            <input type="text" name="label" defaultValue={scope ? scope.label: ""} onChange={(e) => setLabel(e.target.value)}/>
          </label>
          <label>
            Description:
            <input type="text" name="description" defaultValue={scope ? scope.description: ""} onChange={(e) => setDescription(e.target.value)}/>
          </label>
          <input type="hidden" name="action" value="" />
          { scope 
           && descriptionIsDifferent ?
            <button type="submit" disabled={cluster ? false : true } onClick={() => { 
              document.querySelector('input[name="action"]').value = 'description'; 
            }}>Update description</button> 
          : null }
        {scope && isDifferent ? <div className="previous-scope">
          <h4>Previous Scope Settings</h4>
          Embedding: {scope.embedding_id}<br/>
          Umap: { scope.umap_id }<br/>
          Cluster: { scope.cluster_id }<br/>
          Labels: { scope.cluster_labels_id }<br/>

        </div> : null }

        <JobProgress job={scopeJob} clearJob={()=> {
            setScopeJob(null)
            if(scopeJob?.status == "completed") {
              fetchScopes(dataset.id, (scopes) => {
                console.log("fetched and setting")
                onNew(scopes)
                if(scopeJob.job_name == "rm") {
                  navigate(`/datasets/${dataset.id}/setup`)
                } else {
                  onChange(scopes.find(d => d.id == scopeJob.run_id))
                  navigate(`/datasets/${dataset.id}/setup/${scopeJob.run_id}`);
                }
              })
            }
        }} />

          {scope && !scopeJob ? <button type="submit" disabled={cluster ? false : true } onClick={() => { 
              document.querySelector('input[name="action"]').value = 'save'; 
            }}>Overwrite {scope.name}</button> : null }
            { isDifferent && !scopeJob ? <button type="submit" disabled={cluster  ? false : true } onClick={() => { 
              document.querySelector('input[name="action"]').value = 'new'; 
            }}>New scope</button> : null }
        </form>


        { scope ? <div className="scope-actions" style={{display: "flex", justifyContent: "space-between", flexDirection: "row"}}>
          <div className="links">
            <Link to={`/datasets/${dataset?.id}/explore/${scope?.id}`}> Explore {scope.label} ({scope.id}) <br/></Link>
            <Link to={`/datasets/${dataset?.id}/export/${scope?.id}`}> Export data ({scope.id}) <br/></Link>
            <Link to={`/datasets/${dataset?.id}/plot/${scope?.id}`}> Export plot ({scope.id}) <br/></Link>
          </div>
          <div className="delete">
            <button onClick={() => startDeleteScopeJob({dataset: dataset.id, scope_id: scope.id})}>Delete scope</button>
          </div>
        </div> : null}
        
      </div>
    </div>
  );
}

export default Scope;