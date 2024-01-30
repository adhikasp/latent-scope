# Usage: python umapper.py <dataset_name> <model> <neighbors> <min_dist>
# Example: python umapper.py dadabase-curated BAAI_bge-small-en-v1.5 50 0.075
import os
import re
import sys
import json
import umap
import pickle
import argparse
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from latentscope.util import get_data_dir

def main():
    parser = argparse.ArgumentParser(description='UMAP embeddings for a dataset')
    parser.add_argument('name', type=str, help='Dataset name (directory name in data/)')
    parser.add_argument('model', type=str, help='Name of embedding model to use')
    parser.add_argument('neighbors', type=int, help='Output file', default=25)
    parser.add_argument('min_dist', type=float, help='Output file', default=0.075)

    # Parse arguments
    args = parser.parse_args()
    umapper(args.name, args.model, args.neighbors, args.min_dist)


# TODO move this into shared space
def calculate_point_size(num_points, min_size=10, max_size=30, base_num_points=100):
    """
    Calculate the size of points for a scatter plot based on the number of points.
    """
    # TODO fix this to actually calculate a log scale between min and max size
    if num_points <= base_num_points:
        return max_size
    else:
        return min(min_size + min_size * np.log(num_points / base_num_points), max_size)


def umapper(dataset_name, model_id, neighbors=25, min_dist=0.075):
    DATA_DIR = get_data_dir()
    # read in the embeddings
    embeddings = np.load(os.path.join(DATA_DIR, dataset_name, "embeddings", f"{model_id}.npy"))

    umap_dir = os.path.join(DATA_DIR, dataset_name, "umaps")
    if not os.path.exists(umap_dir):
        os.makedirs(umap_dir)

    # determine the index of the last umap run by looking in the dataset directory
    # for files named umap-<number>.json
    umap_files = [f for f in os.listdir(umap_dir) if re.match(r"umap-\d+\.json", f)]
    if len(umap_files) > 0:
        last_umap = sorted(umap_files)[-1]
        last_umap_number = int(last_umap.split("-")[1].split(".")[0])
        next_umap_number = last_umap_number + 1
    else:
        next_umap_number = 1

    # make the umap name from the number, zero padded to 3 digits
    umap_name = f"umap-{next_umap_number:03d}"

    reducer = umap.UMAP(
        n_neighbors=neighbors,
        min_dist=min_dist,
        metric='cosine',
        random_state=42,
        n_components=2,
        verbose=True,
    )

    umap_embeddings = reducer.fit_transform(embeddings)

    min_values = np.min(umap_embeddings, axis=0)
    max_values = np.max(umap_embeddings, axis=0)

    # Scale the embeddings to the range [0, 1]
    umap_embeddings = (umap_embeddings - min_values) / (max_values - min_values)

    # Scale the embeddings to the range [-1, 1]
    umap_embeddings = 2 * umap_embeddings - 1

    # save umap embeddings to a parquet file with columns x,y
    df = pd.DataFrame(umap_embeddings, columns=['x', 'y'])
    output_file = os.path.join(umap_dir, f"{umap_name}.parquet")
    df.to_parquet(output_file)
    print("wrote", output_file)

    # generate a scatterplot of the umap embeddings and save it to a file
    
    fig, ax = plt.subplots(figsize=(14.22, 14.22))  # 1024px by 1024px at 72 dpi
    point_size = calculate_point_size(umap_embeddings.shape[0])
    print("POINT SIZE", point_size, "for", umap_embeddings.shape[0], "points")
    plt.scatter(umap_embeddings[:, 0], umap_embeddings[:, 1], s=point_size, alpha=0.5)
    plt.axis('off')  # remove axis
    plt.gca().set_position([0, 0, 1, 1])  # remove margins
    plt.savefig(os.path.join(umap_dir, f"{umap_name}.png"))

    # save a json file with the umap parameters
    with open(os.path.join(umap_dir, f'{umap_name}.json'), 'w') as f:
        json.dump({
            "name": umap_name, 
            "embeddings": model_id,
            "neighbors": neighbors, 
            "min_dist": min_dist
        }, f, indent=2)
    f.close()

    # save a pickle of the umap
    with open(os.path.join(umap_dir, f'{umap_name}.pkl'), 'wb') as f:
        pickle.dump(reducer, f)
    print("done")


if __name__ == "__main__":
    main()