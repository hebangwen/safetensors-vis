import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown, Database, ChevronRight } from 'lucide-react';
const Index = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [treeData, setTreeData] = useState([]);
  const [totalParams, setTotalParams] = useState(0);
  const [expandedFiles, setExpandedFiles] = useState({});

  const parseHuggingFaceUrl = (url) => {
    // 支持多种 HuggingFace URL 格式
    const patterns = [
      /https:\/\/huggingface\.co\/([^\/]+)\/([^\/]+)(?:\/tree\/main\/?(.*))?/,
      /https:\/\/huggingface\.co\/datasets\/([^\/]+)\/([^\/]+)(?:\/tree\/main\/?(.*))?/
    ];
    
    for (let pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2],
          path: match[3] || ''
        };
      }
    }
    return null;
  };

  const fetchSafetensorsMetadata = async () => {
    if (!repoUrl) return;
    
    setLoading(true);
    try {
      const parsed = parseHuggingFaceUrl(repoUrl);
      if (!parsed) {
        throw new Error('Invalid HuggingFace URL');
      }
      
      const { owner, repo, path } = parsed;
      
      // 构建 API URL 来获取仓库文件列表
      const apiUrl = `https://huggingface.co/api/models/${owner}/${repo}`;
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      // 获取 safetensors 文件
      const safetensorsFiles = data.siblings?.filter(file => 
        file.rfilename?.endsWith('.safetensors')
      ) || [];
      
      let totalParams = 0;
      const treeItems = [];
      
      // 处理每个 safetensors 文件
      for (const file of safetensorsFiles) {
        try {
          // 获取文件头信息（前8字节包含头大小信息）
          const fileUrl = `https://huggingface.co/${owner}/${repo}/resolve/main/${file.rfilename}`;
          const headResponse = await fetch(fileUrl, {
            headers: {
              Range: 'bytes=0-7'
            }
          });
          
          if (!headResponse.ok) continue;
          
          const buffer = await headResponse.arrayBuffer();
          const view = new DataView(buffer);
          const headerLength = view.getBigUint64(0, true);
          
          // 获取完整的头部信息
          const fullHeaderResponse = await fetch(fileUrl, {
            headers: {
              Range: `bytes=8-${8 + Number(headerLength) - 1}`
            }
          });
          
          if (!fullHeaderResponse.ok) continue;
          
          const headerText = await fullHeaderResponse.text();
          const headerData = JSON.parse(headerText);
          
          // 计算参数量并构建树结构
          const fileParams = calculateTotalParameters(headerData);
          totalParams += fileParams;
          
          // 过滤和验证 tensor 数据
          const validTensors = Object.entries(headerData).filter(([key, tensor]) => {
            return tensor && typeof tensor === 'object' && Array.isArray(tensor.shape);
          });
          
          treeItems.push({
            id: file.rfilename,
            name: file.rfilename,
            params: fileParams,
            children: validTensors.map(([key, tensor]) => ({
              id: `${file.rfilename}-${key}`,
              name: key,
              shape: tensor.shape || [],
              dtype: tensor.dtype || 'unknown',
              params: calculateParameters(tensor.shape)
            }))
          });
        } catch (error) {
          console.error(`Error processing file ${file.rfilename}:`, error);
        }
      }
      
      setTreeData(treeItems);
      setTotalParams(totalParams);
    } catch (error) {
      console.error('Error fetching model information:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateParameters = (shape) => {
    if (!shape || !Array.isArray(shape) || shape.length === 0) return 0;
    return shape.reduce((acc, dim) => {
      const dimension = Number(dim);
      return isNaN(dimension) ? acc : acc * dimension;
    }, 1);
  };

  const calculateTotalParameters = (headerData) => {
    if (!headerData || typeof headerData !== 'object') return 0;
    
    return Object.values(headerData).reduce((total, tensor) => {
      if (!tensor || typeof tensor !== 'object' || !Array.isArray(tensor.shape)) {
        return total;
      }
      return total + calculateParameters(tensor.shape);
    }, 0);
  };

  const formatNumber = (num) => {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toString();
  };

  const toggleFileExpansion = (fileId) => {
    setExpandedFiles(prev => ({
      ...prev,
      [fileId]: !prev[fileId]
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">HuggingFace Model Parameter Statistics</h1>
          <p className="text-gray-600">Enter the HuggingFace model repository URL to analyze the parameters of safetensors files</p>
        </div>
        
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="mr-2 h-5 w-5" />
              Model Repository Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                placeholder="Enter HuggingFace model repository URL, e.g., https://huggingface.co/meta-llama/Llama-2-7b"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="flex-1"
              />
              <Button 
                onClick={fetchSafetensorsMetadata} 
                disabled={loading}
                className="flex items-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : 'Analyze Model'}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {totalParams > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Model Parameter Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                Total Parameters: {formatNumber(totalParams)}
              </div>
            </CardContent>
          </Card>
        )}
        
        {treeData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Model File Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {treeData.map((file) => (
                  <div key={file.id} className="border rounded-lg">
                    <div 
                      className="font-medium text-lg p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleFileExpansion(file.id)}
                    >
                      <div>
                        {expandedFiles[file.id] ? 
                          <ChevronDown className="inline mr-2 h-4 w-4" /> : 
                          <ChevronRight className="inline mr-2 h-4 w-4" />
                        }
                        {file.name} 
                        <span className="text-sm font-normal text-gray-500 ml-2">
                          ({formatNumber(file.params)} Parameter)
                        </span>
                      </div>
                    </div>
                    {expandedFiles[file.id] && (
                      <div className="pl-8 pr-4 pb-4 -mt-2 border-l-2 border-gray-200">
                        {file.children && file.children.map((tensor) => (
                          <div key={tensor.id} className="py-2 flex justify-between items-center border-b border-gray-100">
                            <div className="font-mono text-sm">{tensor.name}</div>
                            <div className="flex gap-4 text-sm text-gray-500">
                              <span>Shape: [{(tensor.shape || []).join(', ')}]</span>
                              <span>Dtype: {tensor.dtype || 'unknown'}</span>
                              <span>Param: {formatNumber(tensor.params)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Index;
