package main

import (
	"fmt"
	"strings"
)

type treemapBuilderNode struct {
	id        string
	name      string
	value     float64
	color     float64
	archiveID int64
	children  map[string]*treemapBuilderNode
}

func buildTreemapProjection(runtime *libraryRuntime, params treemapParams) (treemapNode, error) {
	query := archiveQueryParams{
		LibraryID:  params.LibraryID,
		Text:       params.Text,
		PathPrefix: params.PathPrefix,
		Rules:      params.Rules,
		SortBy:     areaMetricSort(params.AreaBy),
		SortDesc:   true,
		Page:       pageRequest{Limit: maximumPageSize},
	}
	archives, err := queryArchives(runtime, query)
	if err != nil {
		return treemapNode{}, err
	}
	root := &treemapBuilderNode{id: "root", name: "Library", children: make(map[string]*treemapBuilderNode)}
	for _, archive := range archives.Items {
		area := archiveAreaValue(archive, params.AreaBy)
		if area <= 0 {
			area = 1
		}
		color := archiveColorValue(archive)
		relativePath := strings.TrimPrefix(archive.RelativePath, strings.Trim(strings.ReplaceAll(params.PathPrefix, "\\", "/"), "/")+"/")
		parts := strings.Split(relativePath, "/")
		current := root
		current.value += area
		current.color = maxFloat(current.color, color)
		for index, part := range parts {
			prefix := strings.Join(parts[:index+1], "/")
			child := current.children[prefix]
			if child == nil {
				child = &treemapBuilderNode{id: "folder:" + prefix, name: part, children: make(map[string]*treemapBuilderNode)}
				current.children[prefix] = child
			}
			child.value += area
			child.color = maxFloat(child.color, color)
			if index == len(parts)-1 {
				child.id = fmt.Sprintf("archive:%d", archive.ID)
				child.archiveID = archive.ID
			}
			current = child
		}
	}
	return root.toNode(), nil
}

func (node *treemapBuilderNode) toNode() treemapNode {
	result := treemapNode{ID: node.id, Name: node.name, Value: node.value, Color: node.color, ArchiveID: node.archiveID}
	if len(node.children) == 0 {
		return result
	}
	children := make([]treemapNode, 0, len(node.children))
	for _, child := range node.children {
		children = append(children, child.toNode())
	}
	sortTreemapNodes(children)
	result.Children = children
	return result
}

func archiveAreaValue(archive archiveRow, metric string) float64 {
	switch metric {
	case "totalImageSize":
		return float64(archive.CompressedImageBytes)
	case "averageImageSize":
		return archive.AverageImageBytes
	case "averageBytesPerMegapixel":
		return archive.AverageBytesPerMegapixel
	case "medianBytesPerMegapixel":
		return archive.MedianBytesPerMegapixel
	case "anomalyCount":
		return float64(archive.AnomalyCount)
	case "estimatedSavings":
		return float64(archive.EstimatedSavingsBytes)
	default:
		return float64(archive.Size)
	}
}

func areaMetricSort(metric string) string {
	switch metric {
	case "totalImageSize", "averageImageSize", "averageBytesPerMegapixel", "anomalyCount", "estimatedSavings":
		return metric
	default:
		return "archiveSize"
	}
}

func archiveColorValue(archive archiveRow) float64 {
	if archive.ImageMemberCount == 0 {
		return 0
	}
	if archive.AnomalyCount == 0 {
		return 0
	}
	return float64(archive.AnomalyCount) / float64(archive.ImageMemberCount)
}

func maxFloat(left float64, right float64) float64 {
	if right > left {
		return right
	}
	return left
}

func sortTreemapNodes(nodes []treemapNode) {
	for index := 0; index < len(nodes); index++ {
		for other := index + 1; other < len(nodes); other++ {
			if nodes[other].Value > nodes[index].Value || (nodes[other].Value == nodes[index].Value && nodes[other].Name < nodes[index].Name) {
				nodes[index], nodes[other] = nodes[other], nodes[index]
			}
		}
	}
}
