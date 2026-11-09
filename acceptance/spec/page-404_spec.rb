require_relative 'spec_helper'

# page-404 is the catch-all Worker for *.toby.codes and *.tobys.cloud.
# These hosts have their own routes and must keep answering as themselves.
describe 'page-404', type: :feature do
  describe 'does not steal real hosts' do
    {
      'https://www.toby.codes/' => 200,
      'https://assets.tobys.cloud/styles.css' => 200,
    }.each do |url, code|
      it "leaves #{url} alone" do
        page = agent.get(url)
        expect(page.code.to_i).to eq(code)
      end
    end
  end
end
