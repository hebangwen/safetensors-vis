import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Database } from 'lucide-react';

const Index = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [treeData, setTreeData] = useState([]);
  const [totalParams, setTotalParams] = useState(0);

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
        throw new Error('无效的 HuggingFace 仓库 URL');
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
          console.error(`处理文件 ${file.rfilename} 时出错:`, error);
        }
      }
      
      setTreeData(treeItems);
      setTotalParams(totalParams);
    } catch (error) {
      console.error('获取模型信息时出错:', error);
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">HuggingFace 模型参数统计</h1>
          <p className="text-gray-600">输入 HuggingFace 模型仓库 URL，分析 safetensors 文件参数量</p>
        </div>
        
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="mr-2 h-5 w-5" />
              模型仓库信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                placeholder="输入 HuggingFace 模型仓库 URL，例如: https://huggingface.co/meta-llama/Llama-2-7b"
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
                    分析中...
                  </>
                ) : '分析模型'}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {totalParams > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>模型参数统计</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                总参数量: {formatNumber(totalParams)}
              </div>
            </CardContent>
          </Card>
        )}
        
        {treeData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>模型文件详情</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {treeData.map((file) => (
                  <div key={file.id} className="border rounded-lg p-4">
                    <div className="font-medium text-lg mb-2">
                      {file.name} 
                      <span className="text-sm font-normal text-gray-500 ml-2">
                        ({formatNumber(file.params)} 参数)
                      </span>
                    </div>
                    <div className="pl-4 border-l-2 border-gray-200">
                      {file.children && file.children.map((tensor) => (
                        <div key={tensor.id} className="py-2 flex justify-between items-center border-b border-gray-100">
                          <div className="font-mono text-sm">{tensor.name}</div>
                          <div className="flex gap-4 text-sm text-gray-500">
                            <span>Shape: [{(tensor.shape || []).join(', ')}]</span>
                            <span>Dtype: {tensor.dtype || 'unknown'}</span>
                            <span>参数: {formatNumber(tensor.params)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
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
